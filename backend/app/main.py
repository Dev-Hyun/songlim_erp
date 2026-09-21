import asyncio
import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.observability import request_logging_middleware, setup_logging, setup_sentry
from app.routers import (
    admin,
    auth,
    bids_news,
    board,
    calendar,
    contracts,
    deliveries,
    inventory,
    med_stats,
    misc,
    notifications,
    sales_map,
    stats,
    storage,
    supply,
    uploads,
    kakao_bridge,
)

setup_logging()
_sentry_enabled = setup_sentry()

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
app.middleware("http")(request_logging_middleware)

app.include_router(auth.router)
app.include_router(sales_map.router)
app.include_router(stats.router)
app.include_router(med_stats.router)
app.include_router(contracts.router)
app.include_router(deliveries.router)
app.include_router(inventory.router)
app.include_router(board.router)
app.include_router(misc.router)
app.include_router(bids_news.router)
app.include_router(calendar.router)
app.include_router(admin.router)
app.include_router(supply.router)
app.include_router(uploads.router)
app.include_router(storage.router)
app.include_router(notifications.router)
app.include_router(kakao_bridge.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "sentry_enabled": _sentry_enabled}


@app.on_event("startup")
async def _startup():
    from app.routers.bids_news import refresh_bids_job, refresh_news_job

    # 입찰정보/의료뉴스 모두 매일 07:00 1회 갱신으로 통일
    _scheduler.add_job(refresh_bids_job, "cron", hour=7, minute=0, id="bids")
    _scheduler.add_job(refresh_news_job, "cron", hour=7, minute=0, id="news")
    _scheduler.start()
    asyncio.create_task(refresh_bids_job())
    asyncio.create_task(refresh_news_job())
