"""영업지도 병원 상세(/api/hospital/{id}) — 식약처 허가 정보 조인과 국산/수입 규칙.

장비 행의 license_no 와 mfds_device_items.license_no 는 적재 때 같은 규칙으로 정규화돼 있어
그대로 맞춘다. 국산/수입은 허가번호 머리글자(제/수)가 우선이고, 머리글자로 안 갈리는
번호(체외진단 등)만 식약처 업종을 본다.
"""
import pytest
from sqlalchemy import select

from app.models import Equipment, Hospital, MfdsDeviceItem, User
from app.routers.sales_map import _origin
from app.security import hash_password

pytestmark = pytest.mark.asyncio


def test_origin_rule():
    assert _origin("제허90-13호", "수입업") == "국산"  # 머리글자가 업종보다 앞선다
    assert _origin("수인17-4091호", None) == "수입"
    assert _origin("체외12-34호", "수입업") == "수입"
    assert _origin("인2-100호", "디지털의료기기제조업") == "국산"
    assert _origin("체외12-35호", None) is None
    assert _origin(None, None) is None


async def _seed(db_session) -> Hospital:
    h = (await db_session.execute(select(Hospital).where(Hospital.ykiho == "DETAIL1"))).scalar_one_or_none()
    if h:
        return h
    h = Hospital(name="상세테스트병원", type="상급종합병원", sido="서울특별시", sigungu="송파구",
                 ykiho="DETAIL1", estb_date="1989-05-20")
    db_session.add(h)
    await db_session.flush()

    def eq(category, year, model, license_no=None, **kw):
        return Equipment(hospital_id=h.id, category=category, year=year, model=model, eq_count=1,
                         license_no=license_no, **kw)

    db_session.add_all([
        # 레거시 6분류: 허가번호 없음, 연도 이력은 그대로 다 간다
        eq("ct", 2025, "SOMATOM Force", manufacturer="Siemens", brand="Siemens Healthineers", source="import"),
        eq("ct", 2024, "SOMATOM Force", manufacturer="Siemens", brand="Siemens Healthineers", source="import"),
        # 심평원 전체 분류: 최신 연도만 간다
        eq("A211", 2025, "CASIA 2", "수인17-4091호", category_name="안구광학단층촬영기",
           manufacturer="TOMEY corporation", brand="TOMEY corporation", source="hira_2025"),
        eq("A211", 2025, "SE-30", "제허90-13호", category_name="안구광학단층촬영기", source="hira_2025"),
        eq("A211", 2025, "XX-1", "수허00-1호", category_name="안구광학단층촬영기", source="hira_2025"),
        eq("A211", 2025, "NO-MFDS", "수인99-9999호", category_name="안구광학단층촬영기", source="hira_2025"),
        eq("A211", 2024, "OLD-ONLY", "수인11-1111호", category_name="안구광학단층촬영기", source="odcloud_2024"),
    ])

    def item(sn, lic, **kw):
        return MfdsDeviceItem(item_sn=sn, license_no=lic, **kw)

    db_session.add_all([
        item("DT1", "수인17-4091호", maker_name="TOMEY corporation", client_name="TOMEY corporation",
             item_name="안구광학단층촬영기", permit_date="2017-03-02", nation="일본", industry="수입업"),
        # 한 허가번호에 품목 두 줄 — 하나만 취하면 허가는 유효, 품목명은 가장 이른 허가 행
        item("DT2", "제허90-13호", maker_name="Infopia (Shandong)", client_name="(주)인포피아",
             item_name="개인용저주파자극기", permit_date="1990-09-30", nation="중국", industry="제조업",
             revoked_code="2", revoked_date="2015-11-05"),
        item("DT3", "제허90-13호", item_name="다른 품목", permit_date="1995-01-01", industry="제조업"),
        # 모든 행이 취소·취하 → revoked
        item("DT4", "수허00-1호", maker_name="Gone Inc", item_name="옛 장비", permit_date="2000-01-01",
             industry="수입업", revoked_code="1", revoked_date="2010-02-03"),
        # 최신 연도에 없는 장비의 허가번호 → 응답에 실리지 않는다
        item("DT5", "수인11-1111호", item_name="안 보일 품목", industry="수입업"),
    ])
    db_session.add(User(username="detail_staff", password_hash=hash_password("pw"), display_name="직원",
                        role="songrim", is_approved=True))
    await db_session.commit()
    return h


async def test_detail_payload(client, db_session):
    h = await _seed(db_session)
    res = await client.post("/api/auth/login", json={"username": "detail_staff", "password": "pw"})
    assert res.status_code == 200

    d = (await client.get(f"/api/hospital/{h.id}")).json()

    assert d["hospital"]["estb_date"] == "1989-05-20"
    assert d["category_names"]["A211"] == "안구광학단층촬영기"

    # 레거시 분류는 연도 이력 전부, 나머지는 최신 연도 하나
    assert [y["year"] for y in d["yearly_by_category"]["ct"]] == [2025, 2024]
    assert [y["year"] for y in d["yearly_by_category"]["A211"]] == [2025]

    ct = d["yearly_by_category"]["ct"][0]["models"][0]
    assert ct["maker"] == "Siemens Healthineers" and ct["manufacturer"] == "Siemens"
    assert ct["license_no"] is None

    lic = d["licenses"]
    assert set(lic) == {"수인17-4091호", "제허90-13호", "수허00-1호"}  # MFDS에 없는 번호·지난 연도 번호는 없음

    assert lic["수인17-4091호"]["origin"] == "수입"
    assert lic["수인17-4091호"]["makers"] == ["TOMEY corporation"]
    assert lic["수인17-4091호"]["nation"] == "일본"
    assert lic["수인17-4091호"]["revoked"] is False

    domestic = lic["제허90-13호"]
    assert domestic["origin"] == "국산"
    assert domestic["item_name"] == "개인용저주파자극기"
    assert domestic["permit_date"] == "1990-09-30"
    assert domestic["revoked"] is False and domestic["revoked_date"] is None

    gone = lic["수허00-1호"]
    assert gone["revoked"] is True and gone["revoked_date"] == "2010-02-03"
