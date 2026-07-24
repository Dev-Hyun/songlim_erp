from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CsComment, CsTicket, NewsArticle, Notice, TechPost, User
from app.routers.auth import require_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

GROUP_BUY_CATEGORIES = ("공동구매", "중고기기")


def _iso(v) -> str:
    """created_at이 TimestampMixin(datetime) / CsComment(str) 등 타입이 섞여 있어 문자열로 통일."""
    if isinstance(v, datetime):
        return v.isoformat()
    return v or ""


@router.get("")
async def list_notifications(db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    """병원 계정 전용 — 병원용 공지사항/의료소식/공동구매/중고기기 신규 글, 내 CS 티켓에 달린 답변을 모아서 보여준다.
    직원 계정은 대상이 아니라 빈 목록을 반환한다."""
    if user.role != "hospital":
        return {"unread_count": 0, "items": []}

    seen_at = user.notifications_seen_at or "1970-01-01"
    items = []

    notices = (
        await db.execute(select(Notice).where(Notice.notice_type == "hospital").order_by(Notice.created_at.desc()).limit(10))
    ).scalars().all()
    for n in notices:
        items.append({"type": "notice", "label": "병원 공지사항", "title": n.title, "created_at": _iso(n.created_at), "link": "/notices/hospital"})

    news = (await db.execute(select(NewsArticle).order_by(NewsArticle.created_at.desc()).limit(10))).scalars().all()
    for a in news:
        items.append({"type": "news", "label": "의료소식", "title": a.title, "created_at": _iso(a.created_at), "link": "/news"})

    posts = (
        await db.execute(
            select(TechPost).where(TechPost.category.in_(GROUP_BUY_CATEGORIES)).order_by(TechPost.created_at.desc()).limit(10)
        )
    ).scalars().all()
    for p in posts:
        link = "/group-buy" if p.category == "공동구매" else "/used-equipment"
        items.append({"type": "tech-post", "label": p.category, "title": p.title, "created_at": _iso(p.created_at), "link": link})

    if user.hospital_profile_id:
        rows = (
            await db.execute(
                select(CsComment, CsTicket.id)
                .join(CsTicket, CsTicket.id == CsComment.ticket_id)
                .where(CsTicket.created_by == user.id)
                .order_by(CsComment.created_at.desc())
                .limit(10)
            )
        ).all()
        for c, tid in rows:
            items.append({"type": "cs", "label": "CS 답변", "title": "내 CS 문의에 답변이 등록되었습니다", "created_at": _iso(c.created_at), "link": f"/cs/{tid}"})

    items.sort(key=lambda x: x["created_at"] or "", reverse=True)
    unread_count = sum(1 for it in items if (it["created_at"] or "") > seen_at)
    return {"unread_count": unread_count, "items": items[:20]}


@router.post("/seen")
async def mark_notifications_seen(db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    user.notifications_seen_at = datetime.now(timezone.utc).isoformat()
    await db.commit()
    return {"ok": True}
