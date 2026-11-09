"""제안서 내려받기 파일 — PPT 변환과 잠깐 보관.

휴대폰(특히 안드로이드의 앱 안 브라우저·다운로드 관리자)은 브라우저 안에서 만든 blob 파일을 제대로 저장하지 못해
"지원하지 않는 파일 형식"이 됐다. 그래서 서버가 파일을 먼저 만들어 임시 폴더에 두고, 추측할 수 없는 일회용
주소(/api/proposals/download/<token>/<파일명>)를 돌려준다. 브라우저는 그 주소를 일반 파일처럼 받는다.
주소에 로그인 쿠키가 필요 없는 건 다운로드 관리자가 쿠키를 안 들고 가는 경우가 있어서다 — 대신 10분 뒤 지운다.
"""
import io
import json
import re
import secrets
import tempfile
import time
from pathlib import Path

EXPORT_DIR = Path(tempfile.gettempdir()) / "songlim_proposal_exports"
TTL_SEC = 600
_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{32}$")

PDF_TYPE = "application/pdf"
PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

SLIDE_DPI = 200  # A4 가로 2339×1654px — 화면·인쇄 모두 선명, 파일은 PDF와 비슷한 크기


def pdf_to_pptx(pdf: bytes) -> bytes:
    """PDF 각 장을 A4 가로 슬라이드 한 장에 꽉 차는 그림으로 넣는다(모양이 PDF와 똑같다)."""
    import pymupdf
    from pptx import Presentation
    from pptx.util import Mm

    doc = pymupdf.open(stream=pdf, filetype="pdf")
    prs = Presentation()
    prs.slide_width, prs.slide_height = Mm(297), Mm(210)
    blank = prs.slide_layouts[6]
    for page in doc:
        img = page.get_pixmap(dpi=SLIDE_DPI).tobytes("jpeg", jpg_quality=90)
        slide = prs.slides.add_slide(blank)
        slide.shapes.add_picture(io.BytesIO(img), 0, 0, prs.slide_width, prs.slide_height)
    out = io.BytesIO()
    prs.save(out)
    return out.getvalue()


def _cleanup(now: float) -> None:
    for f in EXPORT_DIR.glob("*.json"):
        try:
            if now - f.stat().st_mtime > TTL_SEC:
                f.unlink(missing_ok=True)
                f.with_suffix(".bin").unlink(missing_ok=True)
        except OSError:
            pass


def save_export(data: bytes, filename: str, media_type: str) -> str:
    """파일을 보관하고 토큰을 돌려준다."""
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    _cleanup(time.time())
    token = secrets.token_urlsafe(24)  # 32자
    (EXPORT_DIR / f"{token}.bin").write_bytes(data)
    (EXPORT_DIR / f"{token}.json").write_text(json.dumps({"name": filename, "type": media_type}, ensure_ascii=False),
                                              encoding="utf-8")
    return token


def load_export(token: str) -> tuple[Path, str, str] | None:
    """(파일 경로, 파일명, 형식). 없거나 10분이 지났으면 None."""
    if not _TOKEN_RE.match(token):
        return None
    meta = EXPORT_DIR / f"{token}.json"
    data = meta.with_suffix(".bin")
    try:
        if time.time() - meta.stat().st_mtime > TTL_SEC or not data.exists():
            return None
        m = json.loads(meta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data, m["name"], m["type"]
