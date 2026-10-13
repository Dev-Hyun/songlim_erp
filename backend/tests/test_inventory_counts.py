"""개수 관리(LUMOS·쉬스) — 사용하기(보유-1/사용+1), 기록, 되돌리기, ADMIN 전용 초기 수량. 두 품목이 섞이지 않아야 한다."""
import pytest
from sqlalchemy import select

from app.models import InvCountStock, User
from app.security import hash_password

pytestmark = pytest.mark.asyncio


async def _user(db_session, username: str, is_admin: bool = False) -> User:
    user = User(
        username=username, password_hash=hash_password("pw1234"), display_name=username,
        role="songrim", is_admin=is_admin, is_approved=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _login(client, db_session, username: str, is_admin: bool = False):
    await _user(db_session, username, is_admin)
    res = await client.post("/api/auth/login", json={"username": username, "password": "pw1234"})
    assert res.status_code == 200
    return {"session_token": res.cookies["session_token"]}


async def _seed_stock(db_session, office: str, on_hand: int, used: int, item: str = "LUMOS"):
    """테스트 DB는 create_all로 만들어져 마이그레이션의 0/0 씨앗 행이 없다 — 직접 넣는다."""
    row = (await db_session.execute(
        select(InvCountStock).where(InvCountStock.item == item, InvCountStock.office == office)
    )).scalar_one_or_none()
    if row is None:
        row = InvCountStock(item=item, office=office)
        db_session.add(row)
    row.on_hand = on_hand
    row.used = used
    await db_session.commit()


USE_PAYLOAD = {
    "office": "대전", "used_on": "2026-10-13", "site": "이대목동병원",
    "professor": "김OO", "procedure": "신경차단술", "staff_name": "정기현",
}


async def test_use_decrements_on_hand_and_logs(client, db_session):
    cookies = await _login(client, db_session, "lumos1")
    await _seed_stock(db_session, "대전", 50, 25)

    res = await client.post("/api/inventory/counts/LUMOS/use", cookies=cookies, json=USE_PAYLOAD)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["stock"] == {"office": "대전", "on_hand": 49, "used": 26}
    assert body["log"]["kind"] == "use"
    assert body["log"]["site"] == "이대목동병원"
    assert body["log"]["on_hand_after"] == 49
    assert body["log"]["actor_name"] == "lumos1"

    res = await client.get("/api/inventory/counts/LUMOS", cookies=cookies)
    data = res.json()
    daejeon = next(s for s in data["stocks"] if s["office"] == "대전")
    assert (daejeon["on_hand"], daejeon["used"]) == (49, 26)
    assert data["logs"][0]["id"] == body["log"]["id"]


async def test_use_rejected_when_nothing_on_hand(client, db_session):
    cookies = await _login(client, db_session, "lumos2")
    await _seed_stock(db_session, "대구", 0, 10)

    res = await client.post("/api/inventory/counts/LUMOS/use", cookies=cookies, json={**USE_PAYLOAD, "office": "대구"})
    assert res.status_code == 400


async def test_use_rejects_unknown_office(client, db_session):
    cookies = await _login(client, db_session, "lumos3")
    res = await client.post("/api/inventory/counts/LUMOS/use", cookies=cookies, json={**USE_PAYLOAD, "office": "부산"})
    assert res.status_code == 400


async def test_undo_restores_counts_and_keeps_row(client, db_session):
    cookies = await _login(client, db_session, "lumos4")
    await _seed_stock(db_session, "서울", 45, 11)

    log = (await client.post("/api/inventory/counts/LUMOS/use", cookies=cookies, json={**USE_PAYLOAD, "office": "서울"})).json()["log"]
    res = await client.delete(f"/api/inventory/counts/LUMOS/logs/{log['id']}", cookies=cookies)
    assert res.status_code == 200, res.text
    assert res.json()["stock"] == {"office": "서울", "on_hand": 45, "used": 11}

    logs = (await client.get("/api/inventory/counts/LUMOS/logs?office=서울", cookies=cookies)).json()
    mine = next(l for l in logs if l["id"] == log["id"])
    assert mine["kind"] == "undone"  # 행은 남고 되돌려졌다는 표시만 붙는다

    # 두 번 되돌리기는 안 된다
    res = await client.delete(f"/api/inventory/counts/LUMOS/logs/{log['id']}", cookies=cookies)
    assert res.status_code == 400


async def test_undo_only_by_author_or_admin(client, db_session):
    author = await _login(client, db_session, "lumos5a")
    other = await _login(client, db_session, "lumos5b")
    admin = await _login(client, db_session, "lumos5admin", is_admin=True)
    await _seed_stock(db_session, "대전", 50, 25)

    log1 = (await client.post("/api/inventory/counts/LUMOS/use", cookies=author, json=USE_PAYLOAD)).json()["log"]
    assert (await client.delete(f"/api/inventory/counts/LUMOS/logs/{log1['id']}", cookies=other)).status_code == 403
    assert (await client.delete(f"/api/inventory/counts/LUMOS/logs/{log1['id']}", cookies=admin)).status_code == 200


async def test_stock_adjust_is_admin_only_and_logged(client, db_session):
    staff = await _login(client, db_session, "lumos6")
    admin = await _login(client, db_session, "lumos6admin", is_admin=True)
    await _seed_stock(db_session, "대전", 50, 25)
    await _seed_stock(db_session, "대구", 50, 24)
    await _seed_stock(db_session, "서울", 40, 11)

    payload = {"items": [{"office": "서울", "on_hand": 45, "used": 11}], "reason": "10/13 본사 입고 5개"}
    assert (await client.put("/api/inventory/counts/LUMOS/stock", cookies=staff, json=payload)).status_code == 403

    res = await client.put("/api/inventory/counts/LUMOS/stock", cookies=admin, json=payload)
    assert res.status_code == 200, res.text
    seoul = next(s for s in res.json()["stocks"] if s["office"] == "서울")
    assert (seoul["on_hand"], seoul["used"]) == (45, 11)

    logs = (await client.get("/api/inventory/counts/LUMOS/logs?office=서울", cookies=admin)).json()
    adj = logs[0]
    assert adj["kind"] == "adjust"
    assert adj["note"] == "10/13 본사 입고 5개"
    assert "40" in adj["detail"] and "45" in adj["detail"]
    assert adj["on_hand_after"] == 45

    # 바뀐 게 없는 사무실은 기록이 생기지 않는다
    res = await client.put("/api/inventory/counts/LUMOS/stock", cookies=admin, json={"items": [{"office": "대전", "on_hand": 50, "used": 25}], "reason": "x"})
    assert res.status_code == 200
    daejeon_logs = (await client.get("/api/inventory/counts/LUMOS/logs?office=대전", cookies=admin)).json()
    assert all(l["kind"] != "adjust" for l in daejeon_logs)


async def test_stock_adjust_rejects_negative(client, db_session):
    admin = await _login(client, db_session, "lumos7admin", is_admin=True)
    res = await client.put("/api/inventory/counts/LUMOS/stock", cookies=admin, json={"items": [{"office": "대전", "on_hand": -1, "used": 0}], "reason": "x"})
    assert res.status_code == 400


async def test_logs_filter_by_month(client, db_session):
    cookies = await _login(client, db_session, "lumos8")
    await _seed_stock(db_session, "대구", 50, 0)
    await client.post("/api/inventory/counts/LUMOS/use", cookies=cookies, json={**USE_PAYLOAD, "office": "대구", "used_on": "2026-09-30", "site": "9월건"})
    await client.post("/api/inventory/counts/LUMOS/use", cookies=cookies, json={**USE_PAYLOAD, "office": "대구", "used_on": "2026-10-02", "site": "10월건"})

    logs = (await client.get("/api/inventory/counts/LUMOS/logs?office=대구&month=2026-09", cookies=cookies)).json()
    assert [l["site"] for l in logs] == ["9월건"]


async def test_equipment_has_no_grade_field(client, db_session):
    cookies = await _login(client, db_session, "lumos9")
    res = await client.post("/api/inventory/equipment", cookies=cookies, json={
        "category": "지멘스", "item_type": "ECG CABLE", "name": "케이블", "manufacturer": "지멘스",
    })
    assert res.status_code == 200
    assert "grade" not in res.json()
    assert res.json()["manufacturer"] == "지멘스"

    # 등급 칸 편집 요청은 무시된다(EQ_EDITABLE에 없음)
    res = await client.post("/api/inventory/equipment/cells", cookies=cookies, json={
        "edits": [{"row_id": res.json()["id"], "field": "grade", "old_value": "", "new_value": "L"}]
    })
    assert res.status_code == 200
    assert res.json()["updated"] == [] or "grade" not in res.json()["updated"][0]


async def test_sheath_is_separate_from_lumos(client, db_session):
    cookies = await _login(client, db_session, "sheath1")
    await _seed_stock(db_session, "대전", 10, 0, item="LUMOS")
    await _seed_stock(db_session, "대전", 7, 0, item="쉬스")

    res = await client.post("/api/inventory/counts/쉬스/use", cookies=cookies, json={**USE_PAYLOAD, "site": "쉬스사용"})
    assert res.status_code == 200, res.text
    assert res.json()["stock"] == {"office": "대전", "on_hand": 6, "used": 1}

    lumos = (await client.get("/api/inventory/counts/LUMOS", cookies=cookies)).json()
    assert next(s for s in lumos["stocks"] if s["office"] == "대전")["on_hand"] == 10
    assert all(l["site"] != "쉬스사용" for l in lumos["logs"])

    sheath = (await client.get("/api/inventory/counts/쉬스", cookies=cookies)).json()
    assert sheath["logs"][0]["site"] == "쉬스사용" and sheath["logs"][0]["item"] == "쉬스"


async def test_unknown_count_item_is_404(client, db_session):
    cookies = await _login(client, db_session, "sheath2")
    assert (await client.get("/api/inventory/counts/바늘", cookies=cookies)).status_code == 404
