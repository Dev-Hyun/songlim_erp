from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.google_calendar_sync import push_create_event, push_delete_event
from app.models import CalendarEvent, CalendarEventAssignee, CalendarEventTeam, StaffProfile, User
from app.routers.auth import require_staff

router = APIRouter(prefix="/api/calendar-events", tags=["calendar"])


@router.get("/staff")
async def list_staff(db: AsyncSession = Depends(get_db), _: User = Depends(require_staff)):
    """캘린더 초대/팀 선택용 — 송림 직원 목록 (부서 포함)."""
    rows = (
        await db.execute(
            select(User, StaffProfile.department)
            .join(StaffProfile, StaffProfile.user_id == User.id, isouter=True)
            .where(User.role == "songrim")
        )
    ).all()
    return [{"id": u.id, "display_name": u.display_name or u.username, "department": dept} for u, dept in rows]


class CalendarEventIn(BaseModel):
    title: str
    start_at: str
    end_at: Optional[str] = None
    is_shared: bool = False
    assignee_ids: list[int] = []
    teams: list[str] = []


@router.get("")
async def list_events(db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    """이벤트당 assignee/team을 개별 조회하던 예전 방식(N+1)을 없애고, 이벤트 id 전체에 대해
    한 번씩만 일괄 조회해서 메모리에서 묶는다 — 일정이 많아져도 쿼리 수가 늘지 않는다."""
    rows = (await db.execute(select(CalendarEvent).order_by(CalendarEvent.start_at))).scalars().all()
    event_ids = [e.id for e in rows]

    assignees_by_event: dict[int, list[int]] = {}
    teams_by_event: dict[int, list[str]] = {}
    if event_ids:
        for a in (await db.execute(select(CalendarEventAssignee).where(CalendarEventAssignee.event_id.in_(event_ids)))).scalars().all():
            assignees_by_event.setdefault(a.event_id, []).append(a.user_id)
        for t in (await db.execute(select(CalendarEventTeam).where(CalendarEventTeam.event_id.in_(event_ids)))).scalars().all():
            teams_by_event.setdefault(t.event_id, []).append(t.team)

    return [
        {
            "id": e.id, "title": e.title, "start_at": e.start_at, "end_at": e.end_at,
            "created_by": e.created_by, "is_shared": e.is_shared,
            "assignee_ids": assignees_by_event.get(e.id, []),
            "teams": teams_by_event.get(e.id, []),
        }
        for e in rows
    ]


@router.post("")
async def create_event(payload: CalendarEventIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    e = CalendarEvent(title=payload.title, start_at=payload.start_at, end_at=payload.end_at,
                       is_shared=payload.is_shared, created_by=user.id)
    db.add(e)
    await db.flush()
    now_iso = datetime.now(timezone.utc).isoformat()
    for uid in payload.assignee_ids:
        db.add(CalendarEventAssignee(event_id=e.id, user_id=uid, created_at=now_iso))
    for team in payload.teams:
        db.add(CalendarEventTeam(event_id=e.id, team=team))
    await db.commit()

    google_event_id = await push_create_event(db, user.id, e)
    if google_event_id:
        e.google_event_id = google_event_id
        await db.commit()

    return {"id": e.id}


@router.patch("/{eid}")
async def update_event(eid: int, payload: CalendarEventIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    e = (await db.execute(select(CalendarEvent).where(CalendarEvent.id == eid))).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")
    if e.created_by != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    e.title = payload.title
    e.start_at = payload.start_at
    e.end_at = payload.end_at
    e.is_shared = payload.is_shared
    await db.execute(delete(CalendarEventAssignee).where(CalendarEventAssignee.event_id == eid))
    await db.execute(delete(CalendarEventTeam).where(CalendarEventTeam.event_id == eid))
    now_iso = datetime.now(timezone.utc).isoformat()
    for uid in payload.assignee_ids:
        db.add(CalendarEventAssignee(event_id=eid, user_id=uid, created_at=now_iso))
    for team in payload.teams:
        db.add(CalendarEventTeam(event_id=eid, team=team))
    await db.commit()
    return {"ok": True}


@router.delete("/{eid}")
async def delete_event(eid: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    e = (await db.execute(select(CalendarEvent).where(CalendarEvent.id == eid))).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")
    if e.created_by != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    if e.google_event_id:
        await push_delete_event(db, e.created_by, e.google_event_id)
    await db.delete(e)
    await db.commit()
    return {"ok": True}
