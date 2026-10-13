"""재고 행 드래그 정렬 — 받은 id 순서대로 sort_order를 다시 매긴다."""
import pytest

from app.models import User
from app.security import hash_password

pytestmark = pytest.mark.asyncio


async def _login(client, db_session, username: str):
    user = User(
        username=username, password_hash=hash_password("pw1234"), display_name=username,
        role="songrim", is_admin=False, is_approved=True,
    )
    db_session.add(user)
    await db_session.commit()
    res = await client.post("/api/auth/login", json={"username": username, "password": "pw1234"})
    assert res.status_code == 200
    return {"session_token": res.cookies["session_token"]}


async def _create(client, cookies, name: str, item_type: str, category: str = "지멘스"):
    res = await client.post("/api/inventory/equipment", cookies=cookies, json={
        "category": category, "item_type": item_type, "name": name,
    })
    assert res.status_code == 200
    return res.json()


async def _names(client, cookies, category: str, item_type: str):
    rows = (await client.get(f"/api/inventory/equipment?category={category}", cookies=cookies)).json()
    return [r["name"] for r in rows if r["item_type"] == item_type]


async def test_reorder_applies_given_sequence_and_logs_moved_row(client, db_session):
    cookies = await _login(client, db_session, "reorder1")
    a = await _create(client, cookies, "ro-A", "정렬테스트")
    b = await _create(client, cookies, "ro-B", "정렬테스트")
    c = await _create(client, cookies, "ro-C", "정렬테스트")
    assert await _names(client, cookies, "지멘스", "정렬테스트") == ["ro-A", "ro-B", "ro-C"]

    # C를 맨 위로 드래그
    res = await client.post("/api/inventory/equipment/reorder", cookies=cookies,
                            json={"ids": [c["id"], a["id"], b["id"]], "moved_id": c["id"]})
    assert res.status_code == 200, res.text
    assert {r["id"] for r in res.json()["updated"]} == {a["id"], b["id"], c["id"]}
    assert await _names(client, cookies, "지멘스", "정렬테스트") == ["ro-C", "ro-A", "ro-B"]

    hist = (await client.get(f"/api/inventory/history?row_id={c['id']}", cookies=cookies)).json()
    assert hist[0]["field"] == "sort_order"
    assert hist[0]["old_value"] == "3번째" and hist[0]["new_value"] == "1번째"

    # 새로고침(전체 조회)과 델타 동기화 모두 같은 순서
    sync = (await client.get("/api/inventory/equipment/sync?category=지멘스", cookies=cookies)).json()
    assert [r["name"] for r in sync["rows"] if r["item_type"] == "정렬테스트"] == ["ro-C", "ro-A", "ro-B"]


async def test_reorder_same_order_changes_nothing(client, db_session):
    cookies = await _login(client, db_session, "reorder2")
    a = await _create(client, cookies, "same-A", "동일테스트")
    b = await _create(client, cookies, "same-B", "동일테스트")
    # 처음 sort_order는 id — 1..n으로 다시 매기면 값은 바뀌지만 순서는 그대로여야 한다
    res = await client.post("/api/inventory/equipment/reorder", cookies=cookies,
                            json={"ids": [a["id"], b["id"]], "moved_id": a["id"]})
    assert res.status_code == 200
    assert await _names(client, cookies, "지멘스", "동일테스트") == ["same-A", "same-B"]
    hist = (await client.get(f"/api/inventory/history?row_id={a['id']}", cookies=cookies)).json()
    assert all(h["field"] != "sort_order" for h in hist)  # 자리가 안 바뀌면 이력도 없다


async def test_reorder_rejects_mixed_groups_and_unknown_ids(client, db_session):
    cookies = await _login(client, db_session, "reorder3")
    x = await _create(client, cookies, "mix-X", "구분X")
    y = await _create(client, cookies, "mix-Y", "구분Y")
    res = await client.post("/api/inventory/equipment/reorder", cookies=cookies, json={"ids": [y["id"], x["id"]]})
    assert res.status_code == 400
    res = await client.post("/api/inventory/equipment/reorder", cookies=cookies, json={"ids": [x["id"], 999999]})
    assert res.status_code == 404
    res = await client.post("/api/inventory/equipment/reorder", cookies=cookies, json={"ids": [x["id"], x["id"]]})
    assert res.status_code == 400
