import pytest

from app.models import User
from app.security import hash_password

pytestmark = pytest.mark.asyncio


async def _make_user(db_session, username: str, password: str, role: str = "songrim", is_admin: bool = False) -> User:
    user = User(
        username=username, password_hash=hash_password(password), display_name=username,
        role=role, is_admin=is_admin, is_approved=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def test_register_staff_auto_approved(client):
    """직원 가입은 승인 대기 없이 바로 로그인된다(SIGNUP_AUTO_APPROVE_STAFF 기본값 true).
    승인 대기로 되돌리려면 서버 환경변수 SIGNUP_AUTO_APPROVE_STAFF=false."""
    res = await client.post("/api/auth/register/staff", json={
        "username": "newstaff1", "password": "pw1234", "display_name": "새직원",
        "department": "영업", "position": "사원",
    })
    assert res.status_code == 200
    assert res.json()["pending_approval"] is False

    login_res = await client.post("/api/auth/login", json={"username": "newstaff1", "password": "pw1234"})
    assert login_res.status_code == 200


async def test_login_wrong_password_then_success(client, db_session):
    await _make_user(db_session, "loginuser1", "correct-pw")

    bad = await client.post("/api/auth/login", json={"username": "loginuser1", "password": "wrong"})
    assert bad.status_code == 401

    good = await client.post("/api/auth/login", json={"username": "loginuser1", "password": "correct-pw"})
    assert good.status_code == 200
    assert good.json()["username"] == "loginuser1"
    assert "session_token" in good.cookies


async def test_login_lockout_after_repeated_failures(client, db_session):
    await _make_user(db_session, "bruteforce1", "correct-pw")

    for _ in range(5):
        res = await client.post("/api/auth/login", json={"username": "bruteforce1", "password": "wrong"})
        assert res.status_code == 401

    # 5회 실패 이후 — 맞는 비밀번호를 넣어도 잠금 상태라 429여야 함
    locked = await client.post("/api/auth/login", json={"username": "bruteforce1", "password": "correct-pw"})
    assert locked.status_code == 429


async def test_staff_only_endpoint_rejects_hospital_role(client, db_session):
    await _make_user(db_session, "hospuser1", "pw", role="hospital")

    login = await client.post("/api/auth/login", json={"username": "hospuser1", "password": "pw"})
    assert login.status_code == 200

    # 캘린더는 송림 직원 전용(require_staff) — 병원 계정은 403
    res = await client.get("/api/calendar-events")
    assert res.status_code == 403
