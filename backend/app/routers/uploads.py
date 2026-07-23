import os
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.models import User
from app.routers.auth import require_staff, require_user

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "post_images")
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


@router.post("/image")
async def upload_post_image(file: UploadFile = File(...), _: User = Depends(require_staff)):
    """공지사항/CS/커뮤니티/건의사항 등 리치텍스트 게시판에 삽입할 이미지 업로드. 직원만 업로드 가능."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="이미지 파일(png/jpg/jpeg/gif/webp)만 업로드할 수 있습니다")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    key = f"{secrets.token_hex(12)}{ext}"
    with open(os.path.join(UPLOAD_DIR, key), "wb") as f:
        f.write(await file.read())
    return {"url": f"/api/uploads/image/{key}"}


@router.get("/image/{key}")
async def get_post_image(key: str, _: User = Depends(require_user)):
    """로그인한 사용자(직원+병원)라면 누구나 열람 — 게시판 글을 볼 수 있으면 그 안의 이미지도 볼 수 있어야 함."""
    safe_key = os.path.basename(key)  # path traversal 방지 — 디렉터리 구분자 제거
    if safe_key != key or os.path.splitext(safe_key)[1].lower() not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="잘못된 요청입니다")
    path = os.path.join(UPLOAD_DIR, safe_key)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다")
    return FileResponse(path)
