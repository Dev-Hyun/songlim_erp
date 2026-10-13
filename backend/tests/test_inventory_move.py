"""재고 행 위/아래 이동 — 같은 분류·구분 안에서 이웃과 순서를 맞바꾼다."""
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


async def _create(client, cookies, name: str, item_type: str = "프로브", category: str = "지멘스"):
    res = await client.post("/api/inventory/equipment", cookies=cookies, json={
        "category": category, "item_type": item_type, "name": name,
    })
    assert res.status_code == 200
    return res.json()


async def _names(client, cookies, category: str, item_type: str):
    rows = (await client.get(f"/api/inventory/equipment?category={category}", cookies=cookies)).json()
    return [r["name"] for r in rows if r["item_type"] == item_type]


async def test_move_up_and_down_swaps_neighbors(client, db_session):
    cookies = await _login(client, db_session, "mover1")
    a = await _create(client, cookies, "mv-A", item_type="이동테스트")
    b = await _create(client, cookies, "mv-B", item_type="이동테스트")
    c = await _create(client, cookies, "mv-C", item_type="이동테스트")
    assert await _names(client, cookies, "지멘스", "이동테스트") == ["mv-A", "mv-B", "mv-C"]
    assert a["sort_order"] < b["sort_order"] < c["sort_order"]

    res = await client.post(f"/api/inventory/equipment/{c['id']}/move", cookies=cookies, json={"direction": "up"})
    assert res.status_code == 200, res.text
    assert {r["id"] for r in res.json()["updated"]} == {b["id"], c["id"]}
    assert await _names(client, cookies, "지멘스", "이동테스트") == ["mv-A", "mv-C", "mv-B"]

    res = await client.post(f"/api/inventory/equipment/{a['id']}/move", cookies=cookies, json={"direction": "down"})
    assert res.status_code == 200
    assert await _names(client, cookies, "지멘스", "이동테스트") == ["mv-C", "mv-A", "mv-B"]

    # 변경 이력에 순서 이동이 남는다
    hist = (await client.get(f"/api/inventory/history?row_id={a['id']}", cookies=cookies)).json()
    assert hist[0]["field"] == "sort_order"


async def test_move_at_edge_is_noop(client, db_session):
    cookies = await _login(client, db_session, "mover2")
    a = await _create(client, cookies, "edge-A", item_type="경계테스트")
    await _create(client, cookies, "edge-B", item_type="경계테스트")

    res = await client.post(f"/api/inventory/equipment/{a['id']}/move", cookies=cookies, json={"direction": "up"})
    assert res.status_code == 200
    assert res.json()["updated"] == []
    assert await _names(client, cookies, "지멘스", "경계테스트") == ["edge-A", "edge-B"]


async def test_move_stays_within_item_type(client, db_session):
    cookies = await _login(client, db_session, "mover3")
    x = await _create(client, cookies, "x-장비", item_type="구분X")
    y = await _create(client, cookies, "y-프로브", item_type="구분Y")

    # 구분Y에는 y 하나뿐이라 위로 못 간다 — 다른 구분의 x와 바뀌면 안 된다
    res = await client.post(f"/api/inventory/equipment/{y['id']}/move", cookies=cookies, json={"direction": "up"})
    assert res.status_code == 200
    assert res.json()["updated"] == []
    rows = (await client.get("/api/inventory/equipment?category=지멘스", cookies=cookies)).json()
    by_id = {r["id"]: r for r in rows}
    assert by_id[x["id"]]["sort_order"] == x["sort_order"]
    assert by_id[y["id"]]["sort_order"] == y["sort_order"]


async def test_move_rejects_bad_direction_and_missing_row(client, db_session):
    cookies = await _login(client, db_session, "mover4")
    a = await _create(client, cookies, "bad-A", item_type="오류테스트")
    assert (await client.post(f"/api/inventory/equipment/{a['id']}/move", cookies=cookies, json={"direction": "left"})).status_code == 400
    assert (await client.post("/api/inventory/equipment/999999/move", cookies=cookies, json={"direction": "up"})).status_code == 404
