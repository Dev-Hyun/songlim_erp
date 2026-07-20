import os
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.google_calendar_sync import create_dedicated_calendar
from app.models import GoogleCalendarLink, User
from app.routers.auth import require_user

router = APIRouter(prefix="/api/google-calendar", tags=["google-calendar"])

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8010/api/google-calendar/callback")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
SCOPES = ["https://www.googleapis.com/auth/calendar"]

# state -> user_id (연동 요청~콜백 사이 짧은 시간만 유지되는 CSRF 방지용 매핑)
_pending_states: dict[str, int] = {}


def _client_config() -> dict:
    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [GOOGLE_REDIRECT_URI],
        }
    }


@router.get("/status")
async def status(db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    link = (await db.execute(select(GoogleCalendarLink).where(GoogleCalendarLink.user_id == user.id))).scalar_one_or_none()
    return {"connected": link is not None}


@router.get("/connect")
async def connect(user: User = Depends(require_user)):
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="구글 캘린더 연동이 아직 설정되지 않았습니다 (GOOGLE_CLIENT_ID/SECRET 필요)")

    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI)
    state = secrets.token_urlsafe(24)
    _pending_states[state] = user.id
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent", state=state)
    return {"auth_url": auth_url}


@router.get("/callback")
async def callback(code: str, state: str, db: AsyncSession = Depends(get_db)):
    user_id = _pending_states.pop(state, None)
    if not user_id:
        raise HTTPException(status_code=400, detail="유효하지 않거나 만료된 연동 요청입니다")

    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI)
    flow.fetch_token(code=code)
    creds = flow.credentials

    calendar_id = await create_dedicated_calendar(creds)
    now = datetime.now(timezone.utc).isoformat()

    existing = (await db.execute(select(GoogleCalendarLink).where(GoogleCalendarLink.user_id == user_id))).scalar_one_or_none()
    if existing:
        existing.google_calendar_id = calendar_id
        existing.access_token = creds.token
        existing.refresh_token = creds.refresh_token or existing.refresh_token
        existing.token_expiry = creds.expiry.replace(tzinfo=timezone.utc).isoformat()
        existing.sync_token = None
        existing.updated_at = now
    else:
        db.add(GoogleCalendarLink(
            user_id=user_id, google_calendar_id=calendar_id,
            access_token=creds.token, refresh_token=creds.refresh_token,
            token_expiry=creds.expiry.replace(tzinfo=timezone.utc).isoformat(),
            created_at=now, updated_at=now,
        ))
    await db.commit()
    return RedirectResponse(url=f"{FRONTEND_URL}/calendar?google_connected=1")


@router.post("/disconnect")
async def disconnect(db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    link = (await db.execute(select(GoogleCalendarLink).where(GoogleCalendarLink.user_id == user.id))).scalar_one_or_none()
    if link:
        await db.delete(link)
        await db.commit()
    return {"ok": True}
