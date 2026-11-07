"""HTML → PDF (Playwright + Chromium).

브라우저는 처음 요청 때 한 번 띄워 앱이 살아 있는 동안 재사용하고, 요청마다 새 컨텍스트만 연다.
동시에 2개까지만 만든다(서버 메모리 보호). HTML은 임시 파일로 써서 file://로 연다 —
그래야 file:// 사진(app/proposal/static, uploads)을 Chromium이 읽을 수 있다.
"""
import asyncio
import logging
import os
import tempfile
from pathlib import Path

log = logging.getLogger(__name__)

TIMEOUT_MS = 30_000
_sem = asyncio.Semaphore(2)
_lock = asyncio.Lock()
_pw = None
_browser = None


class PdfError(Exception):
    pass


async def _get_browser():
    global _pw, _browser
    async with _lock:
        if _browser is None or not _browser.is_connected():
            from playwright.async_api import async_playwright

            if _pw is None:
                _pw = await async_playwright().start()
            # 컨테이너에서는 root로 돌아 sandbox를 끈다.
            _browser = await _pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        return _browser


async def html_to_pdf(html: str) -> bytes:
    async with _sem:
        fd, path = tempfile.mkstemp(suffix=".html")
        os.close(fd)
        Path(path).write_text(html, encoding="utf-8")
        ctx = None
        try:
            browser = await _get_browser()
            ctx = await browser.new_context(viewport={"width": 1123, "height": 794})
            page = await ctx.new_page()
            await page.goto(Path(path).as_uri(), wait_until="load", timeout=TIMEOUT_MS)
            await page.wait_for_function("window.__proposalReady === true", timeout=TIMEOUT_MS)
            # 한 장(1123×794px)과 같은 크기 = A4 가로(297×210mm, 소수점 차이만)
            return await page.pdf(width="1123px", height="794px", print_background=True)
        except Exception as e:  # noqa: BLE001 — 크롬 오류 종류와 상관없이 503으로 보낸다
            log.exception("제안서 PDF 생성 실패")
            raise PdfError(str(e)) from e
        finally:
            if ctx is not None:
                await ctx.close()
            try:
                os.remove(path)
            except OSError:
                pass


async def shutdown() -> None:
    global _pw, _browser
    if _browser is not None:
        await _browser.close()
        _browser = None
    if _pw is not None:
        await _pw.stop()
        _pw = None
