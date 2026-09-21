"""PWA 웹 푸시(Web Push) 발송 헬퍼.

VAPID 키로 서명해 브라우저의 푸시 서비스로 직접 보낸다 — 사내 PC나 외부 서비스 계정이
필요 없다(카카오 브리지와 달리 계정 정지 위험도 없음). 수신 쪽(Service Worker의 push
이벤트 핸들러)은 frontend/public/sw.js에 이미 구현돼 있다.

발송 실패가 본 업무(캘린더/발주 등록 등)를 막으면 안 되므로 예외를 전부 삼킨다 —
app/routers/kakao_bridge.py의 enqueue()와 동일한 원칙.
"""
import json
import os
from typing import Iterable

from pywebpush import webpush, WebPushException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PushSubscription, User

VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_CLAIM_EMAIL = os.environ.get("VAPID_CLAIM_EMAIL", "admin@songlim-erp.local")


async def send_push_to_users(db: AsyncSession, user_ids: Iterable[int], title: str, body: str, url: str = "/") -> None:
    """지정된 사용자들의 모든 구독 기기에 푸시를 보낸다.
    VAPID 키가 설정되지 않았거나 발송이 실패해도 호출부가 깨지면 안 되므로 예외를 삼킨다."""
    if not VAPID_PRIVATE_KEY:
        return
    try:
        ids = list(user_ids)
        if not ids:
            return
        subs = (
            await db.execute(select(PushSubscription).where(PushSubscription.user_id.in_(ids)))
        ).scalars().all()
        payload = json.dumps({"title": title, "body": body, "url": url}, ensure_ascii=False)
        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    data=payload,
                    vapid_private_key=VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": f"mailto:{VAPID_CLAIM_EMAIL}"},
                )
            except WebPushException:
                # 개별 구독 발송 실패(만료/브라우저 종료 등)는 건너뛰고 나머지는 계속 보낸다
                continue
    except Exception:  # noqa: BLE001 — 알림 실패가 본 업무를 막아선 안 된다
        pass


async def send_push_to_staff(db: AsyncSession, title: str, body: str, url: str = "/") -> None:
    """송림 직원(role='songrim') 전체에게 푸시를 보낸다 — 카카오 단톡방 알림과 같은 대상."""
    try:
        user_ids = (await db.execute(select(User.id).where(User.role == "songrim"))).scalars().all()
        await send_push_to_users(db, user_ids, title, body, url)
    except Exception:  # noqa: BLE001
        pass
