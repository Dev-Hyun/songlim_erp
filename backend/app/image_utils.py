"""업로드된 이미지를 적당한 해상도로 리사이즈 + WebP로 변환해서 모바일 로딩을 가볍게 한다.
실패하면(손상된 파일, GIF 애니메이션 등) 원본을 그대로 반환하는 안전한 폴백.

아이폰 HEIC / 안드로이드(갤럭시) 사진 / PDF를 모두 받을 수 있도록:
 - HEIC/HEIF: pillow-heif로 디코드 (register 후엔 PIL이 일반 이미지처럼 연다)
 - PDF: 첫 페이지를 이미지로 렌더링(PyMuPDF)해서 저장/OCR에 사용
"""
import io

MAX_DIMENSION = 1600
WEBP_QUALITY = 82

_heif_registered = False


def _register_heif() -> None:
    global _heif_registered
    if _heif_registered:
        return
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
        _heif_registered = True
    except Exception:
        pass


def _pdf_first_page_png(data: bytes) -> bytes:
    """PDF 첫 페이지를 PNG 바이트로 렌더링. 실패 시 예외를 그대로 올린다."""
    import fitz  # PyMuPDF

    doc = fitz.open(stream=data, filetype="pdf")
    try:
        page = doc.load_page(0)
        pix = page.get_pixmap(dpi=170)
        return pix.tobytes("png")
    finally:
        doc.close()


def optimize_image(data: bytes, ext: str) -> tuple[bytes, str | None]:
    """(최적화된 바이트, 새 확장자) 반환. 최적화 안 했으면 새 확장자는 None.
    HEIC/PDF도 여기서 이미지(WebP)로 변환되어 브라우저에서 바로 보인다."""
    e = ext.lower()
    if e == ".gif":
        return data, None  # 애니메이션 보존을 위해 GIF는 건드리지 않음
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return data, None
    _register_heif()
    try:
        if e == ".pdf":
            data = _pdf_first_page_png(data)
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)  # 폰 카메라 회전 정보 반영
        img = img.convert("RGBA" if img.mode in ("RGBA", "P", "LA") else "RGB")
        w, h = img.size
        if max(w, h) > MAX_DIMENSION:
            scale = MAX_DIMENSION / max(w, h)
            img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=WEBP_QUALITY)
        return buf.getvalue(), "webp"
    except Exception:
        return data, None


def ensure_ocr_compatible(data: bytes, ext: str) -> tuple[bytes, str]:
    """클로바 OCR가 받는 포맷(jpg/png/pdf/tiff)으로 맞춘다.
    HEIC/HEIF는 미지원이므로 JPEG로, PDF는 첫 페이지를 JPEG로 래스터라이즈해서 넘긴다.
    (반환) (바이트, 확장자문자열)"""
    e = ext.lower().lstrip(".")
    try:
        from PIL import Image
    except ImportError:
        return data, e or "jpg"

    def _to_jpeg(src_bytes: bytes) -> bytes:
        img = Image.open(io.BytesIO(src_bytes))
        img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=92)
        return buf.getvalue()

    try:
        if e in ("heic", "heif"):
            _register_heif()
            return _to_jpeg(data), "jpg"
        if e == "pdf":
            return _to_jpeg(_pdf_first_page_png(data)), "jpg"
    except Exception:
        # 변환 실패 시 원본 그대로 넘겨 OCR 쪽에서 판단하게 둔다.
        return data, e or "jpg"
    return data, e or "jpg"
