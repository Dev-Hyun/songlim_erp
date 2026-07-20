import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CalendarEvent, GoogleCalendarLink

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
CALENDAR_NAME = "송림 ERP 일정"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _credentials(db: AsyncSession, link: GoogleCalendarLink) -> Credentials:
    creds = Credentials(
        token=link.access_token,
        refresh_token=link.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=["https://www.googleapis.com/auth/calendar"],
    )
    expiry = datetime.fromisoformat(link.token_expiry)
    if expiry <= datetime.now(timezone.utc):
        creds.refresh(GoogleRequest())
        link.access_token = creds.token
        link.token_expiry = creds.expiry.replace(tzinfo=timezone.utc).isoformat()
        link.updated_at = _now_iso()
        await db.commit()
    return creds


def _service(creds: Credentials):
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


async def create_dedicated_calendar(creds: Credentials) -> str:
    svc = _service(creds)
    result = svc.calendars().insert(body={"summary": CALENDAR_NAME, "timeZone": "Asia/Seoul"}).execute()
    return result["id"]


def _to_google_time(value: str) -> dict:
    # start_at/end_at은 "YYYY-MM-DDTHH:MM" 또는 "YYYY-MM-DD" 형태로 저장됨
    if "T" in value:
        return {"dateTime": value, "timeZone": "Asia/Seoul"}
    return {"date": value}


async def push_create_event(db: AsyncSession, user_id: int, event: CalendarEvent) -> Optional[str]:
    link = (await db.execute(select(GoogleCalendarLink).where(GoogleCalendarLink.user_id == user_id))).scalar_one_or_none()
    if not link:
        return None
    try:
        creds = await _credentials(db, link)
        svc = _service(creds)
        body = {
            "summary": event.title,
            "start": _to_google_time(event.start_at),
            "end": _to_google_time(event.end_at or event.start_at),
        }
        result = svc.events().insert(calendarId=link.google_calendar_id, body=body).execute()
        return result["id"]
    except Exception:
        return None


async def push_delete_event(db: AsyncSession, user_id: int, google_event_id: str) -> None:
    link = (await db.execute(select(GoogleCalendarLink).where(GoogleCalendarLink.user_id == user_id))).scalar_one_or_none()
    if not link:
        return
    try:
        creds = await _credentials(db, link)
        svc = _service(creds)
        svc.events().delete(calendarId=link.google_calendar_id, eventId=google_event_id).execute()
    except Exception:
        pass


def _from_google_time(t: dict) -> Optional[str]:
    if not t:
        return None
    return t.get("dateTime") or t.get("date")


async def pull_events_for_link(db: AsyncSession, link: GoogleCalendarLink) -> None:
    """구글 캘린더(휴대폰에서 생성/수정/삭제된 일정 포함)를 폴링해 로컬 calendar_events에 반영한다."""
    creds = await _credentials(db, link)
    svc = _service(creds)
    kwargs = {"calendarId": link.google_calendar_id, "showDeleted": True, "singleEvents": True}
    if link.sync_token:
        kwargs["syncToken"] = link.sync_token
    else:
        kwargs["timeMin"] = datetime.now(timezone.utc).isoformat()

    try:
        page_token = None
        items = []
        while True:
            if page_token:
                kwargs["pageToken"] = page_token
            resp = svc.events().list(**kwargs).execute()
            items.extend(resp.get("items", []))
            page_token = resp.get("nextPageToken")
            if not page_token:
                link.sync_token = resp.get("nextSyncToken")
                break
    except Exception:
        # syncToken 만료(410) 등 — 다음 폴링에서 전체 재동기화
        link.sync_token = None
        await db.commit()
        return

    for item in items:
        google_id = item["id"]
        local = (
            await db.execute(select(CalendarEvent).where(CalendarEvent.google_event_id == google_id))
        ).scalar_one_or_none()

        if item.get("status") == "cancelled":
            if local:
                await db.delete(local)
            continue

        title = item.get("summary") or "(제목 없음)"
        start_at = _from_google_time(item.get("start"))
        end_at = _from_google_time(item.get("end"))
        if not start_at:
            continue

        if local:
            local.title = title
            local.start_at = start_at
            local.end_at = end_at
        else:
            db.add(CalendarEvent(
                title=title, start_at=start_at, end_at=end_at,
                created_by=link.user_id, is_shared=False, google_event_id=google_id,
            ))

    link.updated_at = _now_iso()
    await db.commit()
