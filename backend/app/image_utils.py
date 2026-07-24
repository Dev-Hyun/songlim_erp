"""업로드된 이미지를 적당한 해상도로 리사이즈 + WebP로 변환해서 모바일 로딩을 가볍게 한다.
실패하면(손상된 파일, GIF 애니메이션 등) 원본을 그대로 반환하는 안전한 폴백."""
import io

MAX_DIMENSION = 1600
WEBP_QUALITY = 82


def optimize_image(data: bytes, ext: str) -> tuple[bytes, str | None]:
    """(최적화된 바이트, 새 확장자) 반환. 최적화 안 했으면 새 확장자는 None."""
    if ext.lower() == ".gif":
        return data, None  # 애니메이션 보존을 위해 GIF는 건드리지 않음
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return data, None
    try:
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
