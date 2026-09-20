"""모델 탐색(동음이의 포함)과 의료기관 상세 엔드포인트.

슬러그가 장비 분류 단위로 만들어지는 탓에 "같은 모델명이 여러 분류에 있는 경우"가 핵심
분기라서, 그 케이스를 실제 데이터로 만들어 두고 목록·선택·상세가 같은 슬러그로 이어지는지 본다.
"""
import pytest
from sqlalchemy import select

from app.models import Equipment, Hospital, User
from app.routers import med_stats
from app.security import hash_password

pytestmark = pytest.mark.asyncio


async def _seed(db_session) -> tuple[Hospital, Hospital]:
    # 두 테스트가 같은 세션 DB를 공유하므로 두 번째 호출에서는 이미 있는 행을 그대로 쓴다
    # (다시 넣으면 비교 모집단이 4곳으로 불어나 순위 검증이 깨진다).
    existing = (await db_session.execute(
        select(Hospital).where(Hospital.name.in_(["카탈로그테스트의원", "카탈로그비교의원"])).order_by(Hospital.id)
    )).scalars().all()
    if len(existing) == 2:
        return existing[0], existing[1]

    a = Hospital(name="카탈로그테스트의원", type="의원", sido="서울특별시", sigungu="강남구", ykiho="JDQ0TEST1")
    b = Hospital(name="카탈로그비교의원", type="의원", sido="서울특별시", sigungu="강남구", ykiho="JDQ0TEST2")
    db_session.add_all([a, b])
    await db_session.flush()

    def eq(h, category, cat_name, model, year, count, **kw):
        return Equipment(
            hospital_id=h.id, category=category, category_name=cat_name, category_code=category,
            model=model, year=year, eq_count=count, source="import", **kw,
        )

    db_session.add_all([
        eq(a, "C101", "초음파영상진단기", "ALPHA-1", 2025, 3,
           manufacturer="가나메디", manufacturer_confidence="확인"),
        eq(a, "C101", "초음파영상진단기", "ALPHA-1", 2024, 1),
        # 같은 모델명이 다른 분류에도 있다 → 동음이의 선택이 필요한 상태
        eq(a, "C202", "자외선치료기", "ALPHA-1", 2025, 1),
        eq(b, "C101", "초음파영상진단기", "BETA-2", 2025, 5),
    ])
    await db_session.commit()
    await db_session.refresh(a)
    await db_session.refresh(b)

    # 분류·모델 집계는 프로세스 캐시(TTL 600초)라 시드 후 반드시 비운다.
    med_stats._catalog_cache.clear()
    med_stats._categories_cache = []
    med_stats._categories_at = 0.0
    return a, b


async def _login_staff(client, db_session, username: str) -> None:
    db_session.add(User(
        username=username, password_hash=hash_password("pw"), display_name="직원",
        role="songrim", is_approved=True,
    ))
    await db_session.commit()
    res = await client.post("/api/auth/login", json={"username": username, "password": "pw"})
    assert res.status_code == 200


async def test_model_index_and_homonym_choice(client, db_session):
    await _seed(db_session)
    await _login_staff(client, db_session, "catalogstaff1")

    res = await client.get("/api/med/catalog/models")
    assert res.status_code == 200
    body = res.json()
    assert body["year"] == 2025
    # 분류×모델 3조합, 모델명 2종, 그중 여러 분류에 걸친 이름 1종
    assert body["totals"] == {"pairs": 3, "names": 2, "homonyms": 1}

    rows = {(i["model"], i["category"]): i for i in body["items"]}
    assert rows[("ALPHA-1", "C101")]["homonym"] is True
    assert rows[("ALPHA-1", "C101")]["hospitals"] == 1
    assert rows[("BETA-2", "C101")]["homonym"] is False

    name_slug = rows[("ALPHA-1", "C101")]["name_slug"]
    alias = await client.get(f"/api/med/catalog/models/{name_slug}")
    assert alias.status_code == 200
    alias_body = alias.json()
    assert alias_body["categories"] == 2
    assert alias_body["names"] == ["ALPHA-1"]
    # 선택지의 슬러그는 모델 상세가 그대로 받아야 한다
    for opt in alias_body["options"]:
        detail = await client.get(f"/api/med/catalog/categories/{opt['category']}/models/{opt['slug']}")
        assert detail.status_code == 200
        assert detail.json()["model"] == opt["model"]

    assert (await client.get("/api/med/catalog/models/no-such-model")).status_code == 404


async def test_hospital_detail_groups_delta_and_peers(client, db_session):
    a, b = await _seed(db_session)
    await _login_staff(client, db_session, "catalogstaff2")

    res = await client.get(f"/api/med/catalog/hospitals/{a.id}")
    assert res.status_code == 200
    body = res.json()

    assert body["hospital"]["name"] == "카탈로그테스트의원"
    assert body["year"] == 2025 and body["prev_year"] == 2024
    assert body["stats"]["categories"] == 2
    assert body["stats"]["units"] == 4
    # 2024에 없던 C202는 증감 계산에서 빠진다 (없던 분류가 통째로 '신규 +'로 잡히지 않게)
    assert body["stats"]["delta_units"] == 2
    assert body["stats"]["delta_skipped"] == 1

    groups = {g["category"]: g for g in body["groups"]}
    assert groups["C101"]["delta"] == 2 and groups["C202"]["delta"] is None
    item = groups["C101"]["items"][0]
    assert item["model"] == "ALPHA-1" and item["units"] == 3
    assert item["manufacturer"] == "가나메디" and item["confidence"] == "확인"
    assert item["slug"], "최신 스냅샷에 있는 모델은 상세 링크용 슬러그가 있어야 한다"

    # 같은 시군구·같은 종별 비교 — 등록 대수가 더 많은 b가 1위
    peers = body["peers"]
    assert peers["available"] is True and peers["total"] == 2 and peers["rank"] == 2
    assert [p["hospital_id"] for p in peers["items"]] == [b.id, a.id]

    # 연도를 지정하면 그 스냅샷만 본다 (2024에는 C101 1대뿐)
    old = await client.get(f"/api/med/catalog/hospitals/{a.id}", params={"year": 2024})
    assert old.status_code == 200
    assert old.json()["stats"] == {
        "categories": 1, "models": 1, "units": 1, "delta_units": None, "delta_skipped": 1,
    }

    assert (await client.get("/api/med/catalog/hospitals/99999999")).status_code == 404
