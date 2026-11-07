"""치료장비 사진 자동 처리 — 업로드한 사진을 제안서 표 칸에 맞게 정리한다.

1) 가장자리와 이어진 흰/밝은 배경을 투명하게(장비 몸체의 흰 부분은 가장자리와 안 이어지면 그대로)
2) 남은 내용 기준으로 여백 잘라내기
3) 긴 변 800px 이하로 줄여 PNG로 저장
numpy 없이 Pillow만 쓴다(서버 이미지에 의존성 추가 없음).
"""
import io

from PIL import Image, ImageChops, ImageDraw, ImageOps

from app.image_utils import _register_heif

MAX_SIDE = 800
BG_THRESHOLD = 244  # 세 채널 중 가장 어두운 값이 이 이상이면 '밝은 배경 후보'
PAD = 2


def process(data: bytes) -> bytes:
    """이미지 바이트 → 정리된 PNG 바이트. 이미지가 아니면 ValueError."""
    _register_heif()
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as e:  # noqa: BLE001 — Pillow가 던지는 예외 종류가 다양하다
        raise ValueError("이미지 파일이 아닙니다") from e
    img = ImageOps.exif_transpose(img).convert("RGBA")

    white = Image.new("RGBA", img.size, (255, 255, 255, 255))
    flat = Image.alpha_composite(white, img).convert("RGB")
    flat = ImageOps.expand(flat, border=PAD, fill=(255, 255, 255))

    r, g, b = flat.split()
    darkest = ImageChops.darker(ImageChops.darker(r, g), b)
    mask = darkest.point(lambda v: 255 if v >= BG_THRESHOLD else 0)
    # 가장자리(패딩)에서 시작해 이어진 밝은 영역만 128로 칠한다 = 배경
    ImageDraw.floodfill(mask, (0, 0), 128, thresh=0)
    bg = mask.point(lambda v: 255 if v == 128 else 0)
    w, h = img.size
    bg = bg.crop((PAD, PAD, PAD + w, PAD + h))

    alpha = ImageChops.subtract(img.getchannel("A"), bg)
    img.putalpha(alpha)
    box = alpha.point(lambda v: 255 if v > 20 else 0).getbbox()
    if box:
        img = img.crop(box)
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)

    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()
