"""PWA 웹 푸시 구독 저장/발송 테스트.

실제 브라우저 Notification 권한 요청이나 진짜 푸시 서비스로의 네트워크 호출은 여기서
검증할 수 없으므로, pywebpush.webpush를 가짜로 바꿔치기해서 다음을 확인한다:
  - 구독 저장 API(UPSERT)가 실제로 동작하는지 (같은 endpoint는 갱신, 새 endpoint는 추가)
  - 발송 헬퍼가 VAPID 키 미설정/발송 실패 시에도 예외를 삼키고 호출부(발주 등록 등)를
    절대 막지 않는지
  - 발송 대상이 송림 직원(role='songrim')으로만 좁혀지는지
"""
import pytest
from sqlalchemy import select

from app import push_notify
from app.models import HospitalProfile, PushSubscription, SupplyCatalog, User
from app.routers import push as push_router
from app.security import hash_password

pytestmark = pytest.mark.asyncio


async def _make_user(db_session, username, role="songrim", **kwargs):
    u = User(
        username=username, password_hash=hash_password("pw"), display_name="테스트유저",
        role=role, is_approved=True, **kwargs,
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


async def test_subscribe_requires_login(client):
    res = await client.post("/api/push/subscribe", json={"endpoint": "https://x/1", "p256dh": "p", "auth": "a"})
    assert res.status_code == 401


async def test_subscribe_upserts_by_endpoint(client, db_session):
    await _make_user(db_session, "pushstaff1")
    login = await client.post("/api/auth/login", json={"username": "pushstaff1", "password": "pw"})
    assert login.status_code == 200

    r1 = await client.post("/api/push/subscribe", json={"endpoint": "https://x/dup", "p256dh": "p1", "auth": "a1"})
    assert r1.status_code == 200
    r2 = await client.post("/api/push/subscribe", json={"endpoint": "https://x/dup", "p256dh": "p2", "auth": "a2"})
    assert r2.status_code == 200

    rows = (
        await db_session.execute(select(PushSubscription).where(PushSubscription.endpoint == "https://x/dup"))
    ).scalars().all()
    assert len(rows) == 1, "같은 endpoint는 갱신되어야지 중복행이 생기면 안 된다"
    assert rows[0].p256dh == "p2"


async def test_unsubscribe_removes_row(client, db_session):
    await _make_user(db_session, "pushstaff2")
    await client.post("/api/auth/login", json={"username": "pushstaff2", "password": "pw"})
    await client.post("/api/push/subscribe", json={"endpoint": "https://x/gone", "p256dh": "p", "auth": "a"})

    res = await client.post("/api/push/unsubscribe", json={"endpoint": "https://x/gone"})
    assert res.status_code == 200
    row = (
        await db_session.execute(select(PushSubscription).where(PushSubscription.endpoint == "https://x/gone"))
    ).scalar_one_or_none()
    assert row is None


async def test_vapid_public_key_endpoint(client, monkeypatch):
    monkeypatch.setattr(push_router, "VAPID_PUBLIC_KEY", "dummy-public-key")
    res = await client.get("/api/push/vapid-public-key")
    assert res.status_code == 200
    assert res.json()["public_key"] == "dummy-public-key"


async def test_send_push_noop_without_vapid_key(monkeypatch, db_session):
    """VAPID_PRIVATE_KEY 미설정이면 webpush를 아예 호출하지 않고 조용히 리턴해야 한다."""
    monkeypatch.setattr(push_notify, "VAPID_PRIVATE_KEY", "")
    calls = []
    monkeypatch.setattr(push_notify, "webpush", lambda **kw: calls.append(kw))
    await push_notify.send_push_to_users(db_session, [1], "제목", "본문")
    assert calls == []


async def test_send_push_swallows_webpush_failure(monkeypatch, db_session):
    """발송 중 예외(WebPushException 등)가 나도 호출부로 전파되면 안 된다 — 카카오 enqueue()와 동일 원칙."""
    from pywebpush import WebPushException

    staff = await _make_user(db_session, "pushstaff3")
    db_session.add(PushSubscription(user_id=staff.id, endpoint="https://x/fail", p256dh="p", auth="a"))
    await db_session.commit()

    monkeypatch.setattr(push_notify, "VAPID_PRIVATE_KEY", "dummy-key")

    def _boom(**kwargs):
        raise WebPushException("boom")

    monkeypatch.setattr(push_notify, "webpush", _boom)

    # 예외가 여기서 밖으로 새어나오면 테스트 자체가 실패(raise)한다
    await push_notify.send_push_to_users(db_session, [staff.id], "제목", "본문")


async def test_send_push_to_staff_excludes_hospital_role(monkeypatch, db_session):
    staff = await _make_user(db_session, "pushstaff4")
    hospital = await _make_user(db_session, "pushhosp1", role="hospital")

    db_session.add(PushSubscription(user_id=staff.id, endpoint="https://x/staff", p256dh="p", auth="a"))
    db_session.add(PushSubscription(user_id=hospital.id, endpoint="https://x/hosp", p256dh="p", auth="a"))
    await db_session.commit()

    monkeypatch.setattr(push_notify, "VAPID_PRIVATE_KEY", "dummy-key")
    sent_endpoints = []

    def _record(**kwargs):
        sent_endpoints.append(kwargs["subscription_info"]["endpoint"])

    monkeypatch.setattr(push_notify, "webpush", _record)

    await push_notify.send_push_to_staff(db_session, "제목", "본문")
    # 같은 테스트 DB를 공유하는 다른 테스트가 만든 songrim 구독도 섞여 들어올 수 있으므로
    # 정확히 이 목록만 왔는지가 아니라, 직원 구독은 포함되고 병원 구독은 제외됐는지만 본다.
    assert "https://x/staff" in sent_endpoints
    assert "https://x/hosp" not in sent_endpoints


async def test_create_order_survives_push_failure(client, db_session, monkeypatch):
    """발주 등록 지점에 나란히 붙인 푸시 발송이 실패해도 발주 자체는 성공해야 한다."""
    hp = HospitalProfile(hospital_name="푸시테스트병원", hospital_type="의원")
    db_session.add(hp)
    await db_session.flush()
    hospital_user = User(
        username="pushorderhosp", password_hash=hash_password("pw"), display_name="담당자",
        role="hospital", hospital_profile_id=hp.id, is_approved=True,
    )
    staff = User(
        username="pushorderstaff", password_hash=hash_password("pw"), display_name="직원",
        role="songrim", is_approved=True,
    )
    item = SupplyCatalog(name="발주소모품", category="소모품", unit="개", unit_price=1000)
    db_session.add_all([hospital_user, staff, item])
    await db_session.commit()
    await db_session.refresh(item)
    await db_session.refresh(staff)
    db_session.add(PushSubscription(user_id=staff.id, endpoint="https://x/orderflow", p256dh="p", auth="a"))
    await db_session.commit()

    monkeypatch.setattr(push_notify, "VAPID_PRIVATE_KEY", "dummy-key")

    def _boom(**kwargs):
        raise Exception("네트워크 실패 시뮬레이션")

    monkeypatch.setattr(push_notify, "webpush", _boom)

    login = await client.post("/api/auth/login", json={"username": "pushorderhosp", "password": "pw"})
    assert login.status_code == 200
    res = await client.post("/api/supply/orders", json={"items": [{"catalog_id": item.id, "qty": 1}]})
    assert res.status_code == 200, "푸시 발송이 실패해도 발주 등록 자체는 성공해야 한다"
