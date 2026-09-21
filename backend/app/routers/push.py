"""PWA 웹 푸시 구독 관리 — VAPID 공개키 배포 + 구독 저장/해제.

로그인 세션(쿠키)을 그대로 쓴다. 새 회원가입/앱 설치 없이, 이미 로그인한 사용자가
브라우저에서 알림을 켜면 이 API로 구독 정보(엔드포인트 + 키)가 저장되고,
이후 app/push_notify.py가 이 표를 읽어 발송한다.
"""
import os

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import PushSubscription, User
from app.routers.auth import require_user

router = APIRouter(prefix="/api/push", tags=["push"])

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")


@router.get("/vapid-public-key")
async def get_vapid_public_key():
    """프론트가 pushManager.subscribe()에 넘길 applicationServerKey."""
    return {"public_key": VAPID_PUBLIC_KEY}


class SubscribeIn(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


@router.post("/subscribe")
async def subscribe(payload: SubscribeIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    """구독 저장 — 이미 같은 엔드포인트(기기/브라우저)로 저장돼 있으면 갱신(UPSERT)."""
    existing = (
        await db.execute(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    ).scalar_one_or_none()
    if existing:
        existing.user_id = user.id
        existing.p256dh = payload.p256dh
        existing.auth = payload.auth
    else:
        db.add(PushSubscription(
            user_id=user.id, endpoint=payload.endpoint, p256dh=payload.p256dh, auth=payload.auth,
        ))
    await db.commit()
    return {"ok": True}


class UnsubscribeIn(BaseModel):
    endpoint: str


@router.post("/unsubscribe")
async def unsubscribe(payload: UnsubscribeIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    existing = (
        await db.execute(
            select(PushSubscription).where(
                PushSubscription.endpoint == payload.endpoint,
                PushSubscription.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()
    return {"ok": True}
