"""구조화 로깅 + 에러 모니터링(Sentry) 설정.

로깅: 요청마다 request_id를 붙여 uvicorn 로그를 "언제/무엇을/얼마나 걸렸는지" 한 줄로 추적 가능하게 함.
Sentry: SENTRY_DSN 환경변수가 없으면 완전히 비활성 상태로 남는다 — OCR과 같은 패턴으로,
DSN이 준비되면 .env에 값만 넣으면 바로 켜지도록 미리 배선만 해둔 상태."""
import logging
import os
import time
import uuid

logger = logging.getLogger("songlim")


def setup_logging() -> None:
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    logger.setLevel(level)


def setup_sentry() -> bool:
    """SENTRY_DSN이 설정된 경우에만 초기화. 반환값은 활성화 여부(헬스체크/로그용)."""
    dsn = os.environ.get("SENTRY_DSN", "")
    if not dsn:
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=dsn,
            integrations=[StarletteIntegration(), FastApiIntegration()],
            traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
        )
        logger.info("Sentry error monitoring enabled")
        return True
    except Exception as e:  # noqa: BLE001 — 모니터링 설정 실패로 앱 자체가 죽으면 안 됨
        logger.warning("Sentry 초기화 실패, 모니터링 없이 계속 진행: %s", e)
        return False


async def request_logging_middleware(request, call_next):
    request_id = str(uuid.uuid4())[:8]
    start = time.monotonic()
    response = None
    try:
        response = await call_next(request)
        return response
    finally:
        duration_ms = int((time.monotonic() - start) * 1000)
        status = response.status_code if response else 500
        logger.info(
            "%s %s %s %sms rid=%s",
            request.method, request.url.path, status, duration_ms, request_id,
        )
