"""재고 표(스프레드시트) — 셀 단위 저장/충돌/델타동기화/변경이력."""
import pytest

from app.models import User
from app.security import hash_password

pytestmark = pytest.mark.asyncio


async def _staff(db_session, username: str) -> User:
    user = User(
        username=username, password_hash=hash_password("pw1234"), display_name=username,
        role="songrim", is_admin=False, is_approved=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _login(client, db_session, username: str):
    await _staff(db_session, username)
    res = await client.post("/api/auth/login", json={"username": username, "password": "pw1234"})
    assert res.status_code == 200
    return {"session_token": res.cookies["session_token"]}


async def _create_row(client, cookies, name: str, category: str = "지멘스"):
    res = await client.post("/api/inventory/equipment", cookies=cookies, json={
        "category": category, "item_type": "장비", "name": name,
    })
    assert res.status_code == 200
    return res.json()


async def test_cell_edit_saves_and_logs_history(client, db_session):
    cookies = await _login(client, db_session, "invgrid1")
    row = await _create_row(client, cookies, "행1")

    res = await client.post("/api/inventory/equipment/cells", cookies=cookies, json={
        "edits": [{"row_id": row["id"], "field": "location", "old_value": "", "new_value": "창고A"}]
    })
    assert res.status_code == 200
    body = res.json()
    assert body["conflicts"] == []
    assert body["updated"][0]["location"] == "창고A"
    assert body["updated"][0]["updated_by_name"] == "invgrid1"

    hist = await client.get(f"/api/inventory/history?row_id={row['id']}", cookies=cookies)
    entries = hist.json()
    assert entries[0]["field"] == "location"
    assert entries[0]["old_value"] == ""
    assert entries[0]["new_value"] == "창고A"
    assert entries[0]["actor_name"] == "invgrid1"
    # 생성 이력도 남아 있어야 한다
    assert any(e["action"] == "create" for e in entries)


async def test_same_cell_conflict_is_rejected_other_cells_still_apply(client, db_session):
    a = await _login(client, db_session, "invgridA")
    b = await _login(client, db_session, "invgridB")
    row = await _create_row(client, a, "행2")

    # A가 먼저 notes를 바꾼다
    first = await client.post("/api/inventory/equipment/cells", cookies=a, json={
        "edits": [{"row_id": row["id"], "field": "notes", "old_value": "", "new_value": "A값"}]
    })
    assert first.json()["conflicts"] == []

    # B는 예전 값('')을 기준으로 같은 칸 + 다른 칸을 저장 → 같은 칸만 충돌, 다른 칸은 반영
    second = await client.post("/api/inventory/equipment/cells", cookies=b, json={
        "edits": [
            {"row_id": row["id"], "field": "notes", "old_value": "", "new_value": "B값"},
            {"row_id": row["id"], "field": "serial_no", "old_value": "", "new_value": "SN-1"},
        ]
    })
    body = second.json()
    assert len(body["conflicts"]) == 1
    assert body["conflicts"][0]["field"] == "notes"
    assert body["conflicts"][0]["theirs"] == "A값"
    assert body["conflicts"][0]["mine"] == "B값"
    assert body["conflicts"][0]["actor_name"] == "invgridA"
    assert body["updated"][0]["serial_no"] == "SN-1"
    assert body["updated"][0]["notes"] == "A값"

    # force=true면 덮어쓴다
    forced = await client.post("/api/inventory/equipment/cells", cookies=b, json={
        "edits": [{"row_id": row["id"], "field": "notes", "old_value": "", "new_value": "B값", "force": True}]
    })
    assert forced.json()["conflicts"] == []
    assert forced.json()["updated"][0]["notes"] == "B값"


async def test_sync_returns_only_changed_rows_and_deletions(client, db_session):
    cookies = await _login(client, db_session, "invgrid3")
    keep = await _create_row(client, cookies, "유지행", category="타사")
    gone = await _create_row(client, cookies, "삭제행", category="타사")

    base = await client.get("/api/inventory/equipment/sync?category=타사", cookies=cookies)
    assert base.json()["full"] is True
    since = base.json()["server_time"]

    # 아무것도 안 바꿨으면 델타는 비어 있다
    quiet = await client.get(f"/api/inventory/equipment/sync?category=타사&since={since}", cookies=cookies)
    assert quiet.json()["rows"] == []
    assert quiet.json()["deleted"] == []

    await client.post("/api/inventory/equipment/cells", cookies=cookies, json={
        "edits": [{"row_id": keep["id"], "field": "location", "old_value": "", "new_value": "B동"}]
    })
    await client.delete(f"/api/inventory/equipment/{gone['id']}", cookies=cookies)

    delta = await client.get(f"/api/inventory/equipment/sync?category=타사&since={since}", cookies=cookies)
    body = delta.json()
    assert [r["id"] for r in body["rows"]] == [keep["id"]]
    assert body["rows"][0]["location"] == "B동"
    assert body["deleted"] == [gone["id"]]


async def test_row_patch_detects_stale_updated_at(client, db_session):
    cookies = await _login(client, db_session, "invgrid4")
    row = await _create_row(client, cookies, "행4")

    payload = {"category": "지멘스", "item_type": "장비", "name": "행4수정",
               "expected_updated_at": "2000-01-01T00:00:00+00:00"}
    stale = await client.patch(f"/api/inventory/equipment/{row['id']}", cookies=cookies, json=payload)
    assert stale.status_code == 409

    payload["expected_updated_at"] = row["updated_at"]
    ok = await client.patch(f"/api/inventory/equipment/{row['id']}", cookies=cookies, json=payload)
    assert ok.status_code == 200
    assert ok.json()["name"] == "행4수정"
