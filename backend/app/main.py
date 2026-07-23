import asyncio
import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    admin,
    auth,
    bids_news,
    board,
    calendar,
    contracts,
    deliveries,
    google_calendar,
    inventory,
    misc,
    sales_map,
    stats,
    supply,
    uploads,
)

app = FastAPI(title="송림 ERP API")
_scheduler = AsyncIOScheduler()

_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(auth.router)
app.include_router(sales_map.router)
app.include_router(stats.router)
app.include_router(contracts.router)
app.include_router(deliveries.router)
app.include_router(inventory.router)
app.include_router(board.router)
app.include_router(misc.router)
app.include_router(bids_news.router)
app.include_router(calendar.router)
app.include_router(google_calendar.router)
app.include_router(admin.router)
app.include_router(supply.router)
app.include_router(uploads.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


async def _sync_google_calendars_job():
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.google_calendar_sync import pull_events_for_link
    from app.models import GoogleCalendarLink

    async with AsyncSessionLocal() as db:
        links = (await db.execute(select(GoogleCalendarLink))).scalars().all()
        for link in links:
            await pull_events_for_link(db, link)


@app.on_event("startup")
async def _startup():
    from app.routers.bids_news import refresh_bids_job, refresh_news_job

    # 레거시와 동일한 스케줄: 입찰정보 매일 07:00, 의료뉴스 매일 07:00/13:00
    _scheduler.add_job(refresh_bids_job, "cron", hour=7, minute=0, id="bids")
    _scheduler.add_job(refresh_news_job, "cron", hour="7,13", minute=0, id="news")
    # 구글 캘린더 → 사이트 역방향 동기화 (휴대폰에서 생성/수정/삭제한 일정 반영), 5분마다 폴링
    _scheduler.add_job(_sync_google_calendars_job, "interval", minutes=5, id="google_calendar_sync")
    _scheduler.start()
    asyncio.create_task(refresh_bids_job())
    asyncio.create_task(refresh_news_job())
