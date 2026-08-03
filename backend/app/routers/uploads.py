import os
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.image_utils import optimize_image
from app.models import User
from app.routers.auth import require_staff, require_user

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "post_images")
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


@router.post("/image")
async def upload_post_image(file: UploadFile = File(...), _: User = Depends(require_staff)):
    """공지사항/CS/커뮤니티/소모품 카탈로그 등에 삽입할 이미지 업로드. 직원만 업로드 가능.
    용량 절감을 위해 1600px 이내로 리사이즈하고 WebP로 변환한다(GIF 애니메이션은 원본 보존)."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="이미지 파일(png/jpg/jpeg/gif/webp)만 업로드할 수 있습니다")
    raw = await file.read()
    optimized, new_ext = optimize_image(raw, ext)
    if new_ext:
        ext = f".{new_ext}"
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    key = f"{secrets.token_hex(12)}{ext}"
    with open(os.path.join(UPLOAD_DIR, key), "wb") as f:
        f.write(optimized)
    return {"url": f"/api/uploads/image/{key}"}


@router.get("/image/{key}")
async def get_post_image(key: str, _: User = Depends(require_user)):
    """로그인한 사용자(직원+병원)라면 누구나 열람 — 게시판 글을 볼 수 있으면 그 안의 이미지도 볼 수 있어야 함.
    key는 업로드 시 매번 새로 발급되는 난수(재업로드해도 기존 key를 덮어쓰지 않음)라 같은 key의 내용은
    절대 바뀌지 않는다 — 브라우저가 다시 요청조차 하지 않도록 길게+immutable로 캐시해서, 소모품 카탈로그처럼
    이미지가 수백 개 걸리는 화면에서 매번 인증 왕복이 반복되는 것을 막는다."""
    safe_key = os.path.basename(key)  # path traversal 방지 — 디렉터리 구분자 제거
    if safe_key != key or os.path.splitext(safe_key)[1].lower() not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="잘못된 요청입니다")
    path = os.path.join(UPLOAD_DIR, safe_key)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=31536000, immutable"})
