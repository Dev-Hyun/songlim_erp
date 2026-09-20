"""장비 검색 엔드포인트 — 복수 선택·결합조건(AND/OR)과 기존 단일 값 동작 보존.

고급 검색이 분류·모델·업체를 복수로 넘기므로, 핵심 분기는 "결합조건에 따라 기관이
남는지"다. 기존 화면·링크가 쓰는 단일 파라미터(category/manufacturer/model)가 그대로
동작하는지도 같은 데이터로 함께 본다.
"""
import pytest
from sqlalchemy import select

from app.models import Equipment, Hospital, User
from app.routers import med_stats
from app.security import hash_password

pytestmark = pytest.mark.asyncio


async def _seed(db_session) -> dict[str, Hospital]:
    # 세션 DB를 다른 테스트와 공유하므로 이미 있으면 그대로 쓴다 (중복 시드 시 건수 검증이 깨진다)
    names = ["검색둘다의원", "검색초음파의원", "검색시티의원"]
    existing = (await db_session.execute(
        select(Hospital).where(Hospital.name.in_(names))
    )).scalars().all()
    if len(existing) == 3:
        return {h.name: h for h in existing}

    both = Hospital(name="검색둘다의원", type="의원", sido="서울특별시", sigungu="강남구", ykiho="EQSRCH1")
    us_only = Hospital(name="검색초음파의원", type="의원", sido="서울특별시", sigungu="강남구", ykiho="EQSRCH2")
    ct_only = Hospital(name="검색시티의원", type="의원", sido="부산광역시", sigungu="해운대구", ykiho="EQSRCH3")
    db_session.add_all([both, us_only, ct_only])
    await db_session.flush()

    def eq(h, category, model, count, **kw):
        return Equipment(
            hospital_id=h.id, category=category, category_code=category,
            category_name={"us": "초음파영상진단기", "ct": "전산화단층촬영장치"}.get(category, category),
            model=model, year=2025, eq_count=count, source="import", **kw,
        )

    db_session.add_all([
        # 레거시 6분류라 brand가 있으면 brand가 표시·필터 기준이 된다
        eq(both, "us", "SRCH-US-1", 2, manufacturer="제조원가", brand="브랜드에이"),
        eq(both, "ct", "SRCH-CT-1", 1, manufacturer="제조원나", brand="브랜드비"),
        eq(us_only, "us", "SRCH-US-2", 3, manufacturer="제조원가", brand="브랜드에이"),
        eq(ct_only, "ct", "SRCH-CT-1", 4, manufacturer="제조원나", brand="브랜드비"),
    ])
    await db_session.commit()

    med_stats._categories_cache = []
    med_stats._categories_at = 0.0
    return {h.name: h for h in [both, us_only, ct_only]}


async def _login_staff(client, db_session, username: str) -> None:
    db_session.add(User(
        username=username, password_hash=hash_password("pw"), display_name="직원",
        role="songrim", is_approved=True,
    ))
    await db_session.commit()
    res = await client.post("/api/auth/login", json={"username": username, "password": "pw"})
    assert res.status_code == 200


def _names(body) -> set[str]:
    return {i["name"] for i in body["items"]}


async def test_multi_category_match_all_and_any(client, db_session):
    await _seed(db_session)
    await _login_staff(client, db_session, "eqsrchstaff1")
    base = "/api/med/equipment/search?year=2025&hospital_q=검색"

    # 모두 포함 — us와 ct를 둘 다 가진 기관만
    res = await client.get(f"{base}&categories=us&categories=ct&match=all")
    assert res.status_code == 200
    assert _names(res.json()) == {"검색둘다의원"}

    # 하나라도 — 셋 다
    res = await client.get(f"{base}&categories=us&categories=ct&match=any")
    assert _names(res.json()) == {"검색둘다의원", "검색초음파의원", "검색시티의원"}

    # 분류와 모델을 같이 고르면 둘 다 전부 갖춘 기관만 (행 단위는 OR, 기관 단위로 AND)
    res = await client.get(
        f"{base}&categories=us&categories=ct&models=SRCH-US-1&models=SRCH-CT-1&match=all"
    )
    assert _names(res.json()) == {"검색둘다의원"}
    # 고른 모델이 고른 분류 중 하나에만 속해도 0건이 되면 안 된다
    res = await client.get(f"{base}&categories=us&categories=ct&models=SRCH-CT-1&match=all")
    assert _names(res.json()) == {"검색둘다의원"}
    res = await client.get(f"{base}&categories=ct&models=SRCH-CT-1&match=all")
    assert _names(res.json()) == {"검색둘다의원", "검색시티의원"}
    # 하나라도 — 분류/모델을 합집합으로 본다
    res = await client.get(f"{base}&categories=ct&models=SRCH-US-2&match=any")
    assert _names(res.json()) == {"검색둘다의원", "검색시티의원", "검색초음파의원"}


async def test_manufacturer_filter_uses_brand_and_is_or_within_list(client, db_session):
    await _seed(db_session)
    await _login_staff(client, db_session, "eqsrchstaff2")
    base = "/api/med/equipment/search?year=2025&hospital_q=검색"

    # 업체는 브랜드 기준 — 저장된 제조원명으로는 안 걸린다
    assert _names((await client.get(f"{base}&manufacturers=제조원가")).json()) == set()
    assert _names((await client.get(f"{base}&manufacturers=브랜드에이")).json()) == {
        "검색둘다의원", "검색초음파의원"
    }
    # 목록 안에서는 OR
    assert _names((await client.get(f"{base}&manufacturers=브랜드에이&manufacturers=브랜드비")).json()) == {
        "검색둘다의원", "검색초음파의원", "검색시티의원"
    }

    # 업체 목록 엔드포인트도 같은 브랜드 식으로 묶여 나와야 선택이 맞물린다
    makers = (await client.get("/api/med/equipment/manufacturers?year=2025&categories=us")).json()
    assert "브랜드에이" in [m["manufacturer"] for m in makers]


async def test_single_value_params_still_work(client, db_session):
    """기존 화면·공유 링크가 쓰는 단일 파라미터 동작(model은 부분 일치)."""
    await _seed(db_session)
    await _login_staff(client, db_session, "eqsrchstaff3")
    base = "/api/med/equipment/search?year=2025&hospital_q=검색"

    assert _names((await client.get(f"{base}&category=ct")).json()) == {"검색둘다의원", "검색시티의원"}
    # 단일 model은 ilike 부분 일치라 접두어만으로도 걸린다
    assert _names((await client.get(f"{base}&model=SRCH-CT")).json()) == {"검색둘다의원", "검색시티의원"}
    # 복수 models는 목록에서 고른 값이라 정확 일치 — 접두어로는 안 걸린다
    assert _names((await client.get(f"{base}&models=SRCH-CT")).json()) == set()

    # 정렬 기본값(이름 오름차순)과 order=desc 뒤집기
    asc = (await client.get(f"{base}&category=ct&sort=name")).json()
    desc = (await client.get(f"{base}&category=ct&sort=name&order=desc")).json()
    assert [i["name"] for i in asc["items"]] == list(reversed([i["name"] for i in desc["items"]]))

    # 조건이 하나도 없으면 400 (기존 가드)
    assert (await client.get("/api/med/equipment/search?year=2025")).status_code == 400
