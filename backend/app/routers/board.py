from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CsComment, CsTicket, Notice, Suggestion, TechComment, TechPost, User
from app.routers.auth import get_current_user, require_staff, require_user

router = APIRouter(prefix="/api", tags=["board"])


# ────────────────────────────────────────────────────────
# 공지사항
# ────────────────────────────────────────────────────────
class NoticeIn(BaseModel):
    title: str
    content: str
    notice_type: str = "hospital"


@router.get("/notices")
async def list_notices(
    db: AsyncSession = Depends(get_db),
    notice_type: Optional[str] = None,
    user: Optional[User] = Depends(get_current_user),
):
    # 병원 계정은 사내용 공지사항을 볼 수 없음 — 요청 파라미터와 무관하게 항상 hospital로 고정
    if user is None or user.role == "hospital":
        notice_type = "hospital"

    q = select(Notice, User.display_name, User.username).join(User, User.id == Notice.created_by).order_by(Notice.created_at.desc())
    if notice_type:
        q = q.where(Notice.notice_type == notice_type)
    rows = (await db.execute(q)).all()
    return [{"id": n.id, "title": n.title, "content": n.content, "notice_type": n.notice_type,
             "created_by": n.created_by, "created_by_name": display_name or username,
             "created_at": n.created_at} for n, display_name, username in rows]


@router.post("/notices")
async def create_notice(payload: NoticeIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    if user.role != "songrim":
        raise HTTPException(status_code=403, detail="공지사항은 송림 직원만 작성할 수 있습니다")
    n = Notice(title=payload.title, content=payload.content, notice_type=payload.notice_type, created_by=user.id)
    db.add(n)
    await db.commit()
    await db.refresh(n)
    return {"id": n.id}


@router.delete("/notices/{nid}")
async def delete_notice(nid: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    if user.role != "songrim":
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    n = (await db.execute(select(Notice).where(Notice.id == nid))).scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=404, detail="공지를 찾을 수 없습니다")
    if n.created_by != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    await db.delete(n)
    await db.commit()
    return {"ok": True}


# ────────────────────────────────────────────────────────
# CS
# ────────────────────────────────────────────────────────
class CsTicketIn(BaseModel):
    title: str
    content: str


class CsCommentIn(BaseModel):
    content: str


@router.get("/cs")
async def list_cs(db: AsyncSession = Depends(get_db), status: Optional[str] = None, user: User = Depends(require_staff)):
    q = (
        select(CsTicket, User.display_name, User.username)
        .join(User, User.id == CsTicket.created_by)
        .order_by(CsTicket.created_at.desc())
    )
    if status:
        q = q.where(CsTicket.status == status)
    rows = (await db.execute(q)).all()
    return [{"id": t.id, "title": t.title, "content": t.content, "status": t.status,
             "created_by": t.created_by, "created_by_name": display_name or username,
             "created_at": t.created_at} for t, display_name, username in rows]


@router.post("/cs")
async def create_cs(payload: CsTicketIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    t = CsTicket(title=payload.title, content=payload.content, created_by=user.id)
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return {"id": t.id}


@router.get("/cs/{tid}")
async def get_cs(tid: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    row = (
        await db.execute(
            select(CsTicket, User.display_name, User.username).join(User, User.id == CsTicket.created_by).where(CsTicket.id == tid)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="티켓을 찾을 수 없습니다")
    t, display_name, username = row
    comments = (await db.execute(select(CsComment).where(CsComment.ticket_id == tid).order_by(CsComment.created_at))).scalars().all()
    return {
        "ticket": {"id": t.id, "title": t.title, "content": t.content, "status": t.status,
                   "created_by": t.created_by, "created_by_name": display_name or username, "created_at": t.created_at},
        "comments": [{"id": c.id, "content": c.content, "created_by": c.created_by, "created_at": c.created_at} for c in comments],
    }


@router.patch("/cs/{tid}/status")
async def update_cs_status(tid: int, status: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    if status not in ("접수", "처리중", "처리완료"):
        raise HTTPException(status_code=400, detail="잘못된 상태값입니다")
    t = (await db.execute(select(CsTicket).where(CsTicket.id == tid))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="티켓을 찾을 수 없습니다")
    t.status = status
    await db.commit()
    return {"ok": True}


@router.post("/cs/{tid}/comments")
async def add_cs_comment(tid: int, payload: CsCommentIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    c = CsComment(ticket_id=tid, content=payload.content, created_by=user.id, created_at=datetime.now(timezone.utc).isoformat())
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return {"id": c.id}


# ────────────────────────────────────────────────────────
# 기술 커뮤니티 (사내 정보 > 커뮤니티)
# ────────────────────────────────────────────────────────
class TechPostIn(BaseModel):
    title: str
    category: str = "general"
    content: str


class TechCommentIn(BaseModel):
    content: str


@router.get("/tech-posts")
async def list_tech_posts(db: AsyncSession = Depends(get_db), category: Optional[str] = None, user: User = Depends(require_staff)):
    q = (
        select(TechPost, User.display_name, User.username)
        .join(User, User.id == TechPost.created_by)
        .order_by(TechPost.created_at.desc())
    )
    if category:
        q = q.where(TechPost.category == category)
    rows = (await db.execute(q)).all()
    return [{"id": p.id, "title": p.title, "content": p.content, "category": p.category, "created_by": p.created_by,
             "created_by_name": display_name or username, "views": p.views, "created_at": p.created_at}
            for p, display_name, username in rows]


@router.post("/tech-posts")
async def create_tech_post(payload: TechPostIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    p = TechPost(title=payload.title, category=payload.category, content=payload.content, created_by=user.id)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return {"id": p.id}


@router.get("/tech-posts/{pid}")
async def get_tech_post(pid: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    row = (
        await db.execute(
            select(TechPost, User.display_name, User.username).join(User, User.id == TechPost.created_by).where(TechPost.id == pid)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다")
    p, display_name, username = row
    p.views += 1
    await db.commit()
    comments = (
        await db.execute(
            select(TechComment, User.display_name, User.username)
            .join(User, User.id == TechComment.created_by)
            .where(TechComment.post_id == pid)
            .order_by(TechComment.created_at)
        )
    ).all()
    return {
        "post": {"id": p.id, "title": p.title, "category": p.category, "content": p.content, "created_by": p.created_by,
                 "created_by_name": display_name or username, "views": p.views, "created_at": p.created_at},
        "comments": [{"id": c.id, "content": c.content, "created_by": c.created_by,
                      "created_by_name": cdn or cun, "created_at": c.created_at} for c, cdn, cun in comments],
    }


@router.post("/tech-posts/{pid}/comments")
async def add_tech_comment(pid: int, payload: TechCommentIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    c = TechComment(post_id=pid, content=payload.content, created_by=user.id, created_at=datetime.now(timezone.utc).isoformat())
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return {"id": c.id}


# ────────────────────────────────────────────────────────
# 건의사항
# ────────────────────────────────────────────────────────
class SuggestionIn(BaseModel):
    title: str
    content: str


@router.get("/suggestions")
async def list_suggestions(db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    # 익명 게시판 — 작성자는 관리자에게도 노출하지 않음 (created_by는 DB에만 보관, API 응답에서 제외)
    rows = (await db.execute(select(Suggestion).order_by(Suggestion.created_at.desc()))).scalars().all()
    return [{"id": s.id, "title": s.title, "content": s.content, "status": s.status,
             "created_at": s.created_at} for s in rows]


@router.post("/suggestions")
async def create_suggestion(payload: SuggestionIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    s = Suggestion(title=payload.title, content=payload.content, created_by=user.id)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return {"id": s.id}


@router.patch("/suggestions/{sid}/status")
async def update_suggestion_status(sid: int, status: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    if status not in ("접수", "검토중", "반영완료"):
        raise HTTPException(status_code=400, detail="잘못된 상태값입니다")
    s = (await db.execute(select(Suggestion).where(Suggestion.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="건의사항을 찾을 수 없습니다")
    s.status = status
    await db.commit()
    return {"ok": True}
