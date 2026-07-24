import pytest

from app.models import HospitalProfile, SupplyCatalog, User
from app.security import hash_password

pytestmark = pytest.mark.asyncio


async def test_hospital_can_order_and_staff_sees_it(client, db_session):
    hp = HospitalProfile(hospital_name="테스트병원", hospital_type="의원")
    db_session.add(hp)
    await db_session.flush()

    hospital_user = User(
        username="orderhosp1", password_hash=hash_password("pw"), display_name="담당자",
        role="hospital", hospital_profile_id=hp.id, is_approved=True,
    )
    staff_user = User(
        username="orderstaff1", password_hash=hash_password("pw"), display_name="직원",
        role="songrim", is_approved=True,
    )
    item = SupplyCatalog(name="테스트소모품", category="소모품", unit="개", unit_price=1000)
    db_session.add_all([hospital_user, staff_user, item])
    await db_session.commit()
    await db_session.refresh(item)

    login = await client.post("/api/auth/login", json={"username": "orderhosp1", "password": "pw"})
    assert login.status_code == 200

    order_res = await client.post("/api/supply/orders", json={
        "items": [{"catalog_id": item.id, "qty": 3}],
        "order_request": "배송희망일 7/30",
    })
    assert order_res.status_code == 200
    body = order_res.json()
    assert body["total_amount"] == 3000

    # 병원 계정은 관리자 발주 목록에 접근 불가
    forbidden = await client.get("/api/supply/admin/orders")
    assert forbidden.status_code == 403

    await client.post("/api/auth/logout")

    staff_login = await client.post("/api/auth/login", json={"username": "orderstaff1", "password": "pw"})
    assert staff_login.status_code == 200

    admin_orders = await client.get("/api/supply/admin/orders")
    assert admin_orders.status_code == 200
    orders = admin_orders.json()
    assert any(o["id"] == body["id"] and o["order_request"] == "배송희망일 7/30" for o in orders)
