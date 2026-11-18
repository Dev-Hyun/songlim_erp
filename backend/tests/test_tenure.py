"""보유 기간(교체 시기) — 같은 병원이 같은 분류의 같은 모델을 최신 연도부터 몇 해 연속 등록했나.

순수 계산(model_tenure)은 경계 규칙(빈 해·모델 교체·최신 연도 기준)을 직접 보고,
영업지도 목록/엑셀/상세는 실제 엔드포인트로 필터와 필드 모양을 본다.
"""
import io

import openpyxl
import pytest
from sqlalchemy import select

from app import tenure
from app.models import Equipment, Hospital, User
from app.security import hash_password
from app.tenure import Tenure, model_tenure


def _rows(hid, model, years):
    return [(hid, y, model) for y in years]


def test_consecutive_years_back_from_latest():
    t = model_tenure(_rows(1, "A", range(2019, 2026)), first_year=2019, latest_year=2025)
    # 첫 연도까지 끊김 없이 이어졌으면 그 전부터 있었을 수도 있다 → capped
    assert t == {(1, "A"): Tenure(years=7, since_year=2019, capped=True)}


def test_gap_breaks_streak():
    # 2022년에 빠졌다가 다시 나타남 → 2023~2025만 센다
    t = model_tenure(_rows(1, "A", [2019, 2020, 2021, 2023, 2024, 2025]), 2019, 2025)
    assert t[(1, "A")] == Tenure(years=3, since_year=2023, capped=False)


def test_model_change_resets():
    rows = _rows(1, "OLD", [2019, 2020, 2021, 2022]) + _rows(1, "NEW", [2023, 2024, 2025])
    t = model_tenure(rows, 2019, 2025)
    # 최신 연도에 없는 OLD는 결과에 없다(이미 교체됨), NEW는 2023년부터
    assert t == {(1, "NEW"): Tenure(years=3, since_year=2023, capped=False)}


def test_anchored_on_latest_year():
    # 2024년까지 있다가 2025년에 사라진 모델은 '지금 보유'가 아니다
    t = model_tenure(_rows(1, "A", range(2019, 2025)) + _rows(2, "B", [2025]), 2019, 2025)
    assert (1, "A") not in t
    assert t[(2, "B")] == Tenure(years=1, since_year=2025, capped=False)


def test_models_and_hospitals_are_independent():
    rows = (_rows(1, "A", range(2019, 2026)) + _rows(1, "B", [2024, 2025])
            + _rows(2, "A", [2025]) + [(1, 2023, "A")])  # 같은 해 중복 행(허가번호만 다른 행)도 한 번으로
    t = model_tenure(rows, 2019, 2025)
    assert t[(1, "A")].years == 7
    assert t[(1, "B")] == Tenure(years=2, since_year=2024, capped=False)
    assert t[(2, "A")].years == 1


def test_late_starting_category_caps_at_its_first_year():
    # 심평원 전체 분류(C108 등)는 2023년부터만 있다 → 3년이 최대이고 '3년 이상'으로 표시해야 한다
    t = model_tenure(_rows(1, "A", [2023, 2024, 2025]), 2023, 2025)
    assert t[(1, "A")] == Tenure(years=3, since_year=2023, capped=True)


# ── 엔드포인트 ───────────────────────────────────────────


async def _seed(db_session):
    names = ["보유기간오래된의원", "보유기간교체의원", "보유기간신규의원"]
    existing = (await db_session.execute(
        select(Hospital).where(Hospital.name.in_(names)).order_by(Hospital.id)
    )).scalars().all()
    if len(existing) == 3:
        return existing
    hs = [Hospital(name=n, type="의원", sido="보유기간도", sigungu="테스트구") for n in names]
    db_session.add_all(hs)
    await db_session.flush()
    old, swapped, new = hs

    def eq(h, model, year, source="import"):
        return Equipment(hospital_id=h.id, category="xray", model=model, year=year,
                         manufacturer="가나", brand="가나", eq_count=1, source=source)

    db_session.add_all(
        [eq(old, "XR-OLD", y) for y in range(2019, 2026)]
        + [eq(swapped, "XR-A", y) for y in range(2019, 2023)]
        + [eq(swapped, "XR-B", y) for y in range(2023, 2026)]
        + [eq(new, "XR-N", 2025),
           # 직원 수동 등록(연도 의미가 공공데이터 스냅샷과 다름)은 보유 기간 계산에서 뺀다
           eq(new, "XR-M", 2026, source="manual")]
    )
    await db_session.commit()
    tenure._span_cache.clear()
    return hs


async def _login(client, db_session, username):
    db_session.add(User(username=username, password_hash=hash_password("pw"), display_name="직원",
                        role="songrim", is_approved=True))
    await db_session.commit()
    res = await client.post("/api/auth/login", json={"username": username, "password": "pw"})
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_hospitals_list_has_tenure_and_filters(client, db_session):
    old, swapped, new = await _seed(db_session)
    await _login(client, db_session, "tenurestaff1")
    base = {"category": "xray", "sido": "보유기간도", "map_only": "false", "sort": "name"}

    res = await client.get("/api/hospitals", params=base)
    assert res.status_code == 200
    by_id = {h["id"]: h for h in res.json()}
    assert by_id[old.id]["tenure_years"] == 7
    assert by_id[old.id]["since_year"] == 2019
    assert by_id[old.id]["tenure_capped"] is True
    assert by_id[old.id]["tenure_model"] == "XR-OLD"
    assert by_id[swapped.id]["tenure_years"] == 3
    assert by_id[swapped.id]["tenure_model"] == "XR-B"
    assert by_id[new.id]["tenure_years"] == 1

    res = await client.get("/api/hospitals", params={**base, "min_tenure": 3})
    assert {h["id"] for h in res.json()} == {old.id, swapped.id}
    res = await client.get("/api/hospitals", params={**base, "min_tenure": 5})
    assert [h["id"] for h in res.json()] == [old.id]
    # 데이터 범위(7년)를 넘는 조건은 아무도 확인할 수 없다
    res = await client.get("/api/hospitals", params={**base, "min_tenure": 8})
    assert res.json() == []


@pytest.mark.asyncio
async def test_export_has_tenure_columns(client, db_session):
    old, _, _ = await _seed(db_session)
    await _login(client, db_session, "tenurestaff2")
    res = await client.get("/api/hospitals/export", params={
        "category": "xray", "sido": "보유기간도", "map_only": "false", "min_tenure": 5})
    assert res.status_code == 200
    ws = openpyxl.load_workbook(io.BytesIO(res.content)).active
    header = [c.value for c in ws[1]]
    rows = [dict(zip(header, [c.value for c in r])) for r in ws.iter_rows(min_row=2)]
    assert [r["병원명"] for r in rows] == [old.name]
    assert rows[0]["보유 연수"] == 7
    assert rows[0]["보유 시작"] == "2019년 이전부터"
    assert rows[0]["보유 기준 모델"] == "XR-OLD"


@pytest.mark.asyncio
async def test_detail_rows_carry_tenure(client, db_session):
    _, swapped, new = await _seed(db_session)
    await _login(client, db_session, "tenurestaff3")
    body = (await client.get(f"/api/hospital/{swapped.id}")).json()
    years = {y["year"]: y["models"] for y in body["yearly_by_category"]["xray"]}
    assert years[2025][0]["model"] == "XR-B"
    assert years[2025][0]["tenure_years"] == 3
    assert years[2025][0]["since_year"] == 2023
    assert years[2025][0]["tenure_capped"] is False
    # 최신 연도가 아닌 행에는 값이 없다(지금 보유 기준으로만 센다)
    assert years[2022][0]["tenure_years"] is None

    body = (await client.get(f"/api/hospital/{new.id}")).json()
    years = {y["year"]: y["models"] for y in body["yearly_by_category"]["xray"]}
    assert years[2026][0]["source"] == "manual" and years[2026][0]["tenure_years"] is None
    assert years[2025][0]["tenure_years"] == 1


def test_rows_without_model_name_are_not_one_model():
    # 모델명이 빈 행은 해마다 다른 장비일 수 있어 이어 세지 않는다
    rows = _rows(1, None, range(2019, 2026)) + _rows(1, "", range(2019, 2026)) + _rows(1, "  ", [2025])
    assert model_tenure(rows, 2019, 2025) == {}


@pytest.mark.asyncio
async def test_model_filter_uses_that_models_tenure_only(client, db_session):
    """model=X 로 찾을 때 X는 올해 새로 들였고 다른 모델 Y가 오래된 병원은 '보유 5년 이상'에 걸리지 않는다."""
    h = Hospital(name="모델필터보유의원", type="의원", sido="모델필터도", sigungu="테스트구")
    db_session.add(h)
    await db_session.flush()
    eq = lambda model, y: Equipment(hospital_id=h.id, category="xray", model=model, year=y,  # noqa: E731
                                    manufacturer="가나", brand="가나", eq_count=1, source="import")
    db_session.add_all([eq("XR-OLDY", y) for y in range(2019, 2026)] + [eq("XR-NEWX", 2025)])
    await db_session.commit()
    tenure._span_cache.clear()
    await _login(client, db_session, "tenurestaff4")
    base = {"category": "xray", "sido": "모델필터도", "map_only": "false", "sort": "name"}
    assert (await client.get("/api/hospitals", params={**base, "model": "XR-NEWX", "min_tenure": 5})).json() == []
    got = (await client.get("/api/hospitals", params={**base, "model": "XR-NEWX"})).json()
    assert got[0]["tenure_model"] == "XR-NEWX" and got[0]["tenure_years"] == 1
    got = (await client.get("/api/hospitals", params={**base, "model": "XR-OLDY", "min_tenure": 5})).json()
    assert got[0]["tenure_model"] == "XR-OLDY" and got[0]["tenure_years"] == 7
