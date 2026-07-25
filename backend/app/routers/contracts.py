import os
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.image_utils import optimize_image
from app.models import Contract, ContractComment, ContractItem, ContractPhoto, User
from app.routers.auth import require_staff

router = APIRouter(prefix="/api/contracts", tags=["contracts"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "contracts")


class ContractItemIn(BaseModel):
    name: str
    qty: Optional[str] = None
    note: Optional[str] = None


class ContractCreateIn(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    hospital_id: Optional[int] = None
    status: str = "진행중"
    contract_date: Optional[str] = None
    buyer_hospital: Optional[str] = None
    buyer_biz_no: Optional[str] = None
    buyer_rep: Optional[str] = None
    buyer_address: Optional[str] = None
    buyer_phone: Optional[str] = None
    buyer_mobile: Optional[str] = None
    buyer_fax: Optional[str] = None
    sale_amount: int = 0
    sale_amount_note: Optional[str] = None
    etc_note: Optional[str] = None
    customer_request: Optional[str] = None
    install_date: Optional[str] = None
    items: list[ContractItemIn] = []


class ContractUpdateIn(BaseModel):
    status: Optional[str] = None
    contract_date: Optional[str] = None
    buyer_hospital: Optional[str] = None
    buyer_biz_no: Optional[str] = None
    buyer_rep: Optional[str] = None
    buyer_address: Optional[str] = None
    buyer_phone: Optional[str] = None
    buyer_mobile: Optional[str] = None
    buyer_fax: Optional[str] = None
    sale_amount: Optional[int] = None
    sale_amount_note: Optional[str] = None
    etc_note: Optional[str] = None
    customer_request: Optional[str] = None
    install_date: Optional[str] = None
    items: Optional[list[ContractItemIn]] = None


class CommentIn(BaseModel):
    body: str


def _serialize(c: Contract) -> dict:
    return {
        "id": c.id, "title": c.title, "author_id": c.author_id, "hospital_id": c.hospital_id,
        "body": c.body, "status": c.status, "contract_date": c.contract_date,
        "buyer_hospital": c.buyer_hospital, "buyer_biz_no": c.buyer_biz_no, "buyer_rep": c.buyer_rep,
        "buyer_address": c.buyer_address, "buyer_phone": c.buyer_phone, "buyer_mobile": c.buyer_mobile,
        "buyer_fax": c.buyer_fax, "sale_amount": c.sale_amount, "sale_amount_note": c.sale_amount_note,
        "etc_note": c.etc_note, "customer_request": c.customer_request, "install_date": c.install_date,
        "created_at": c.created_at, "updated_at": c.updated_at,
    }


@router.get("")
async def list_contracts(db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    rows = (await db.execute(select(Contract).order_by(Contract.updated_at.desc()))).scalars().all()
    result = []
    for c in rows:
        comment_count = len((await db.execute(select(ContractComment).where(ContractComment.contract_id == c.id))).scalars().all())
        result.append({**_serialize(c), "comment_count": comment_count})
    return result


@router.post("")
async def create_contract(payload: ContractCreateIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    title = payload.title or (f"{payload.buyer_hospital} 판매계약" if payload.buyer_hospital else "새 계약 건")
    c = Contract(
        title=title, body=payload.body, hospital_id=payload.hospital_id, status=payload.status, author_id=user.id,
        contract_date=payload.contract_date, buyer_hospital=payload.buyer_hospital, buyer_biz_no=payload.buyer_biz_no,
        buyer_rep=payload.buyer_rep, buyer_address=payload.buyer_address, buyer_phone=payload.buyer_phone,
        buyer_mobile=payload.buyer_mobile, buyer_fax=payload.buyer_fax, sale_amount=payload.sale_amount,
        sale_amount_note=payload.sale_amount_note, etc_note=payload.etc_note,
        customer_request=payload.customer_request, install_date=payload.install_date,
    )
    db.add(c)
    await db.flush()
    for idx, it in enumerate(payload.items):
        db.add(ContractItem(contract_id=c.id, name=it.name, qty=it.qty, note=it.note, sort_order=idx))
    await db.commit()
    await db.refresh(c)
    return _serialize(c)


@router.get("/{cid}")
async def get_contract(cid: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    c = (await db.execute(select(Contract).where(Contract.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="계약을 찾을 수 없습니다")
    items = (await db.execute(select(ContractItem).where(ContractItem.contract_id == cid).order_by(ContractItem.sort_order))).scalars().all()
    photos = (await db.execute(select(ContractPhoto).where(ContractPhoto.contract_id == cid))).scalars().all()
    comments = (await db.execute(select(ContractComment).where(ContractComment.contract_id == cid).order_by(ContractComment.created_at))).scalars().all()
    return {
        "contract": _serialize(c),
        "items": [{"id": i.id, "name": i.name, "qty": i.qty, "note": i.note} for i in items],
        "photos": [{"id": p.id, "image_key": p.image_key, "caption": p.caption} for p in photos],
        "comments": [{"id": cm.id, "user_id": cm.user_id, "body": cm.body, "created_at": cm.created_at} for cm in comments],
    }


@router.patch("/{cid}")
async def update_contract(cid: int, payload: ContractUpdateIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    c = (await db.execute(select(Contract).where(Contract.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="계약을 찾을 수 없습니다")

    data = payload.model_dump(exclude_unset=True, exclude={"items"})
    if data.get("status") and data["status"] not in ("진행중", "보류", "완료"):
        raise HTTPException(status_code=400, detail="잘못된 상태값입니다")
    for k, v in data.items():
        setattr(c, k, v)
    if c.buyer_hospital:
        c.title = f"{c.buyer_hospital} 판매계약"

    if payload.items is not None:
        existing = (await db.execute(select(ContractItem).where(ContractItem.contract_id == cid))).scalars().all()
        for it in existing:
            await db.delete(it)
        for idx, it in enumerate(payload.items):
            db.add(ContractItem(contract_id=cid, name=it.name, qty=it.qty, note=it.note, sort_order=idx))

    await db.commit()
    await db.refresh(c)
    return _serialize(c)


@router.delete("/{cid}")
async def delete_contract(cid: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    c = (await db.execute(select(Contract).where(Contract.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="계약을 찾을 수 없습니다")
    await db.delete(c)
    await db.commit()
    return {"ok": True}


@router.post("/{cid}/comments")
async def add_comment(cid: int, payload: CommentIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    comment = ContractComment(contract_id=cid, user_id=user.id, body=payload.body, created_at=datetime.now(timezone.utc).isoformat())
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return {"id": comment.id, "user_id": comment.user_id, "body": comment.body, "created_at": comment.created_at}


@router.delete("/{cid}/comments/{comment_id}")
async def delete_comment(cid: int, comment_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    comment = (await db.execute(select(ContractComment).where(ContractComment.id == comment_id))).scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다")
    if comment.user_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    await db.delete(comment)
    await db.commit()
    return {"ok": True}


@router.post("/ocr")
async def ocr_contract(file: UploadFile = File(...), _: User = Depends(require_staff)):
    """계약서 사진을 클로바 OCR로 인식해 계약 폼 프리필 값을 반환. 직원 전용."""
    from app import clova_ocr

    if not clova_ocr.is_configured():
        raise HTTPException(status_code=503, detail="OCR이 아직 설정되지 않았습니다 (CLOVA_OCR_INVOKE_URL/SECRET 미설정)")
    ext = os.path.splitext(file.filename or "")[1].lower().lstrip(".") or "jpg"
    content = await file.read()
    try:
        fields = clova_ocr.run_ocr(content, ext)
    except Exception as e:  # noqa: BLE001 — 네트워크/타임아웃 등 원인을 그대로 사용자에게 안내
        raise HTTPException(status_code=502, detail=f"OCR 호출 실패: {type(e).__name__} — 서버가 클로바 OCR 엔드포인트에 접근 가능한지 확인이 필요합니다")
    return clova_ocr.parse_contract(fields)


@router.post("/{cid}/photos")
async def upload_photo(cid: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    """계약 관련 사진 첨부. 용량 절감을 위해 1600px 이내로 리사이즈하고 WebP로 변환한다."""
    dir_path = os.path.join(UPLOAD_DIR, str(cid))
    os.makedirs(dir_path, exist_ok=True)
    token = secrets.token_hex(8)
    orig_ext = os.path.splitext(file.filename or "")[1].lower()
    base_name = os.path.splitext(file.filename or "photo")[0]
    raw = await file.read()
    optimized, new_ext = optimize_image(raw, orig_ext)
    ext = f".{new_ext}" if new_ext else orig_ext
    filename = f"{token}_{base_name}{ext}"
    with open(os.path.join(dir_path, filename), "wb") as f:
        f.write(optimized)

    photo = ContractPhoto(contract_id=cid, image_key=filename, created_at=datetime.now(timezone.utc).isoformat())
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return {"id": photo.id, "image_key": photo.image_key}


@router.get("/{cid}/photos/{photo_id}/image")
async def get_photo(cid: int, photo_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    photo = (await db.execute(select(ContractPhoto).where(ContractPhoto.id == photo_id))).scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=404, detail="사진을 찾을 수 없습니다")
    path = os.path.join(UPLOAD_DIR, str(cid), photo.image_key)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    return FileResponse(path)


@router.delete("/{cid}/photos/{photo_id}")
async def delete_photo(cid: int, photo_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    photo = (await db.execute(select(ContractPhoto).where(ContractPhoto.id == photo_id))).scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=404, detail="사진을 찾을 수 없습니다")
    path = os.path.join(UPLOAD_DIR, str(cid), photo.image_key)
    if os.path.exists(path):
        os.remove(path)
    await db.delete(photo)
    await db.commit()
    return {"ok": True}
