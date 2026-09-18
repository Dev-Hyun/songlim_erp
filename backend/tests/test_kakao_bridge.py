"""카카오톡 단톡방 알림 대기열 + 사내 PC 브리지 API 테스트.

일반 카카오톡 단체방에 메시지를 넣는 공식 API가 없어서, 서버는 알림을 큐에 쌓기만 하고
사내 PC의 브리지가 폴링해 가져간다. 여기서 검증하는 것:
  - 브리지 인증(공유 비밀키)이 실제로 막는지
  - 실패 보고 시 재시도 대상으로 남고, 성공 보고 시 큐에서 빠지는지
  - 줄바꿈이 섞인 본문이 그대로 보존되는지 (한때 \n이 실제 개행으로 깨진 적 있음)
"""
import pytest
from sqlalchemy import select

from app.models import KakaoOutbox
from app.routers import kakao_bridge

pytestmark = pytest.mark.asyncio

TOKEN = "test-bridge-token"
AUTH = {"X-Bridge-Token": TOKEN}
BODY = "[송림 ERP] 새 소모품 발주\n· 병원: 튼튼서울내과\n· 금액: 1,234,000원"


@pytest.fixture(autouse=True)
def _enable_bridge(monkeypatch):
    monkeypatch.setattr(kakao_bridge, "BRIDGE_TOKEN", TOKEN)


async def _enqueue(db_session, text: str = BODY) -> int:
    await kakao_bridge.enqueue(db_session, "supply_order", text)
    await db_session.commit()
    row = (await db_session.execute(
        select(KakaoOutbox).order_by(KakaoOutbox.id.desc())
    )).scalars().first()
    return row.id


async def test_bridge_requires_token(client, db_session):
    await _enqueue(db_session)
    assert (await client.get("/api/kakao-bridge/pending")).status_code == 401
    assert (await client.get("/api/kakao-bridge/pending",
                             headers={"X-Bridge-Token": "wrong"})).status_code == 401


async def test_pending_preserves_newlines(client, db_session):
    await _enqueue(db_session)
    res = await client.get("/api/kakao-bridge/pending", headers=AUTH)
    assert res.status_code == 200
    texts = [i["text"] for i in res.json()]
    assert BODY in texts, "본문이 큐를 거치며 변형되면 안 된다"
    assert "\n· 병원:" in BODY  # 개행이 literal \n 두 글자로 깨지지 않았는지


async def test_failure_retries_then_success_clears(client, db_session):
    oid = await _enqueue(db_session, "재시도 검증용")

    r = await client.post(f"/api/kakao-bridge/{oid}/result",
                          json={"ok": False, "error": "창 못 찾음"}, headers=AUTH)
    assert r.json()["status"] == "pending", "실패는 재시도 대상으로 남아야 한다"

    still = await client.get("/api/kakao-bridge/pending", headers=AUTH)
    assert oid in [i["id"] for i in still.json()]

    r = await client.post(f"/api/kakao-bridge/{oid}/result", json={"ok": True}, headers=AUTH)
    assert r.json()["status"] == "sent"

    after = await client.get("/api/kakao-bridge/pending", headers=AUTH)
    assert oid not in [i["id"] for i in after.json()], "성공한 알림은 큐에서 빠져야 한다"


async def test_gives_up_after_max_attempts(client, db_session):
    oid = await _enqueue(db_session, "재시도 상한 검증용")
    for _ in range(kakao_bridge.MAX_ATTEMPTS):
        await client.post(f"/api/kakao-bridge/{oid}/result",
                          json={"ok": False, "error": "실패"}, headers=AUTH)
    res = await client.get("/api/kakao-bridge/pending", headers=AUTH)
    assert oid not in [i["id"] for i in res.json()], "상한을 넘으면 무한 재시도하지 않아야 한다"
