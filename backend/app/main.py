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
    push,
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
# 컨테이너 시간대가 UTC라 cron hour 를 그대로 쓰면 한국시간과 9시간 어긋난다
# (hour=7 이 실제로는 16:00 KST에 돌고 있었다). 시간대를 명시해 주석의 의도와 맞춘다.
_scheduler = AsyncIOScheduler(timezone="Asia/Seoul")

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
app.include_router(push.router)
app.include_router(kakao_bridge.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "sentry_enabled": _sentry_enabled}


@app.on_event("startup")
async def _startup():
    from app.routers.bids_news import refresh_bids_job, refresh_news_job
    from app.sync_jobs import sync_hira_hospitals_job, sync_openings_job

    # 아래 시각은 전부 한국시간(스케줄러 timezone=Asia/Seoul).
    # 입찰정보/의료뉴스 모두 매일 07:00 1회 갱신으로 통일
    _scheduler.add_job(refresh_bids_job, "cron", hour=7, minute=0, id="bids")
    _scheduler.add_job(refresh_news_job, "cron", hour=7, minute=0, id="news")
    # 의료기관 개설현황(행안부) — 매일 새벽. 전체를 훑느라 오래 걸려 한산한 시간에 돌린다.
    # 그동안 스케줄이 아예 없어 수동 적재 이후로 화면 기준일이 멈춰 있었다.
    _scheduler.add_job(sync_openings_job, "cron", hour=3, minute=30, id="openings")
    # 심평원 병원정보 — 기관 원장 정보라 하루 단위로 바뀌지 않는다. 주 1회(일요일 새벽).
    _scheduler.add_job(sync_hira_hospitals_job, "cron", day_of_week="sun", hour=2, minute=30, id="hira_hospitals")
    _scheduler.start()
    asyncio.create_task(refresh_bids_job())
    asyncio.create_task(refresh_news_job())
