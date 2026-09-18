"""카카오톡 단톡방 알림 — 서버 측 대기열 + 사내 PC 브리지용 API.

배경: 일반 카카오톡 단체 채팅방에 메시지를 넣는 공식 API는 존재하지 않는다(2026년 확인).
그래서 사내 PC의 카카오톡 클라이언트를 창 제어로 조작하는 브리지 프로그램을 쓴다
(tools/kakao_bridge/). 이 방식은 카카오 약관상 자동화 도구에 해당해 계정 제재 가능성이
있으므로, 서버는 '알림 생성'만 담당하고 발송 수단은 이 큐 뒤에 분리해 둔다 —
나중에 사내 알림/메일로 갈아끼울 때 이 파일 바깥은 고칠 필요가 없다.

인증: 브리지는 사람이 아니라 데몬이므로 세션 쿠키가 아니라 공유 비밀키 헤더를 쓴다.
KAKAO_BRIDGE_TOKEN 환경변수가 비어 있으면 이 엔드포인트는 전부 503으로 닫힌다.
"""
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import KakaoOutbox

router = APIRouter(prefix="/api/kakao-bridge", tags=["kakao"])

BRIDGE_TOKEN = os.environ.get("KAKAO_BRIDGE_TOKEN", "")
MAX_ATTEMPTS = 5


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def enqueue(db: AsyncSession, kind: str, text: str) -> None:
    """알림 한 건을 대기열에 넣는다. 호출부(발주/캘린더)에서 await 하되, 실패해도
    본 업무(발주 등록 등)가 깨지면 안 되므로 예외를 삼킨다."""
    try:
        db.add(KakaoOutbox(kind=kind, text=text, status="pending", attempts=0, created_at=_now()))
        await db.flush()
    except Exception:  # noqa: BLE001 — 알림 실패가 본 업무를 막아선 안 된다
        pass


def _require_bridge(x_bridge_token: Optional[str]) -> None:
    if not BRIDGE_TOKEN:
        raise HTTPException(status_code=503, detail="카카오 브리지가 설정되지 않았습니다 (KAKAO_BRIDGE_TOKEN 미설정)")
    if x_bridge_token != BRIDGE_TOKEN:
        raise HTTPException(status_code=401, detail="브리지 토큰이 올바르지 않습니다")


@router.get("/pending")
async def pending(
    limit: int = 10,
    x_bridge_token: Optional[str] = Header(default=None, alias="X-Bridge-Token"),
    db: AsyncSession = Depends(get_db),
):
    """사내 PC 브리지가 주기적으로 호출해 보낼 메시지를 가져간다."""
    _require_bridge(x_bridge_token)
    rows = (
        await db.execute(
            select(KakaoOutbox)
            .where(KakaoOutbox.status == "pending", KakaoOutbox.attempts < MAX_ATTEMPTS)
            .order_by(KakaoOutbox.id)
            .limit(min(limit, 50))
        )
    ).scalars().all()
    return [{"id": r.id, "kind": r.kind, "text": r.text} for r in rows]


class BridgeResultIn(BaseModel):
    ok: bool
    error: Optional[str] = None


@router.post("/{outbox_id}/result")
async def report_result(
    outbox_id: int,
    payload: BridgeResultIn,
    x_bridge_token: Optional[str] = Header(default=None, alias="X-Bridge-Token"),
    db: AsyncSession = Depends(get_db),
):
    """브리지가 발송 성공/실패를 되돌려준다. 실패는 attempts를 올려 MAX_ATTEMPTS까지만 재시도."""
    _require_bridge(x_bridge_token)
    row = (await db.execute(select(KakaoOutbox).where(KakaoOutbox.id == outbox_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="해당 알림이 없습니다")
    row.attempts += 1
    if payload.ok:
        row.status = "sent"
        row.sent_at = _now()
        row.last_error = None
    else:
        row.last_error = (payload.error or "")[:500]
        if row.attempts >= MAX_ATTEMPTS:
            row.status = "failed"
    await db.commit()
    return {"ok": True, "status": row.status, "attempts": row.attempts}
