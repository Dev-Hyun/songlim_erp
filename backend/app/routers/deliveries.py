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
from app.models import Delivery, DeliveryComment, DeliveryItem, DeliveryPhoto, User
from app.routers.auth import require_staff

router = APIRouter(prefix="/api/deliveries", tags=["deliveries"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "deliveries")


class DeliveryItemIn(BaseModel):
    description: Optional[str] = None
    serial_no: Optional[str] = None
    price: Optional[int] = None
    sys_id: Optional[str] = None


class DeliveryCreateIn(BaseModel):
    hospital_name: str
    hospital_type: Optional[str] = None
    installation_date: Optional[str] = None
    installation_location: Optional[str] = None
    rep_doctor: Optional[str] = None
    address: Optional[str] = None
    person_in_charge: Optional[str] = None
    site_type: str = "delivery"  # delivery | demo
    warranty_start: Optional[str] = None
    warranty_end: Optional[str] = None
    maintenance: Optional[str] = None
    demo_result: Optional[str] = None
    items: list[DeliveryItemIn] = []


class DeliveryUpdateIn(BaseModel):
    hospital_name: Optional[str] = None
    hospital_type: Optional[str] = None
    installation_date: Optional[str] = None
    installation_location: Optional[str] = None
    rep_doctor: Optional[str] = None
    address: Optional[str] = None
    person_in_charge: Optional[str] = None
    site_type: Optional[str] = None
    warranty_start: Optional[str] = None
    warranty_end: Optional[str] = None
    maintenance: Optional[str] = None
    demo_result: Optional[str] = None
    items: Optional[list[DeliveryItemIn]] = None


class CommentIn(BaseModel):
    content: str


def _serialize(d: Delivery) -> dict:
    return {
        "id": d.id, "category": d.category, "hospital_name": d.hospital_name, "hospital_type": d.hospital_type,
        "installation_date": d.installation_date, "installation_location": d.installation_location,
        "rep_doctor": d.rep_doctor, "address": d.address, "person_in_charge": d.person_in_charge,
        "created_by": d.created_by, "site_type": d.site_type,
        "warranty_start": d.warranty_start, "warranty_end": d.warranty_end,
        "maintenance": d.maintenance, "demo_result": d.demo_result,
        "created_at": d.created_at, "updated_at": d.updated_at,
    }


def _apply_site_type_fields(site_type: str, data: dict) -> dict:
    """레거시와 동일한 규칙: DEMO는 warranty_start/maintenance를 비우고, 납품&관리는 demo_result를 비움."""
    data = dict(data)
    if site_type == "demo":
        data["warranty_start"] = None
        data["maintenance"] = None
    else:
        data["demo_result"] = None
    return data


@router.get("")
async def list_deliveries(db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    rows = (await db.execute(select(Delivery).order_by(Delivery.updated_at.desc()))).scalars().all()
    return [_serialize(d) for d in rows]


@router.post("")
async def create_delivery(payload: DeliveryCreateIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    if payload.site_type not in ("delivery", "demo"):
        raise HTTPException(status_code=400, detail="잘못된 site_type 입니다")
    data = _apply_site_type_fields(payload.site_type, payload.model_dump(exclude={"items"}))
    d = Delivery(**data, created_by=user.id)
    db.add(d)
    await db.flush()
    for it in payload.items:
        db.add(DeliveryItem(delivery_id=d.id, description=it.description, serial_no=it.serial_no, price=it.price, sys_id=it.sys_id))
    await db.commit()
    await db.refresh(d)
    return _serialize(d)


@router.get("/{did}")
async def get_delivery(did: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    d = (await db.execute(select(Delivery).where(Delivery.id == did))).scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="납품 건을 찾을 수 없습니다")
    items = (await db.execute(select(DeliveryItem).where(DeliveryItem.delivery_id == did))).scalars().all()
    photos = (await db.execute(select(DeliveryPhoto).where(DeliveryPhoto.delivery_id == did))).scalars().all()
    comments = (await db.execute(select(DeliveryComment).where(DeliveryComment.delivery_id == did).order_by(DeliveryComment.created_at))).scalars().all()
    return {
        "delivery": _serialize(d),
        "items": [{"id": i.id, "description": i.description, "serial_no": i.serial_no, "price": i.price, "sys_id": i.sys_id} for i in items],
        "photos": [{"id": p.id, "image_key": p.image_key} for p in photos],
        "comments": [{"id": c.id, "user_id": c.user_id, "content": c.content, "created_at": c.created_at} for c in comments],
    }


@router.patch("/{did}")
async def update_delivery(did: int, payload: DeliveryUpdateIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    d = (await db.execute(select(Delivery).where(Delivery.id == did))).scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="납품 건을 찾을 수 없습니다")

    data = payload.model_dump(exclude_unset=True, exclude={"items"})
    if data.get("site_type") and data["site_type"] not in ("delivery", "demo"):
        raise HTTPException(status_code=400, detail="잘못된 site_type 입니다")
    if "site_type" in data:
        # site_type 전환 시에만 레거시와 동일하게 반대 모드의 값을 초기화
        data = _apply_site_type_fields(data["site_type"], data)
    for k, v in data.items():
        setattr(d, k, v)

    if payload.items is not None:
        existing = (await db.execute(select(DeliveryItem).where(DeliveryItem.delivery_id == did))).scalars().all()
        for it in existing:
            await db.delete(it)
        for it in payload.items:
            db.add(DeliveryItem(delivery_id=did, description=it.description, serial_no=it.serial_no, price=it.price, sys_id=it.sys_id))

    await db.commit()
    await db.refresh(d)
    return _serialize(d)


@router.delete("/{did}")
async def delete_delivery(did: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    d = (await db.execute(select(Delivery).where(Delivery.id == did))).scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="납품 건을 찾을 수 없습니다")
    await db.delete(d)
    await db.commit()
    return {"ok": True}


@router.post("/{did}/comments")
async def add_comment(did: int, payload: CommentIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    comment = DeliveryComment(delivery_id=did, user_id=user.id, content=payload.content, created_at=datetime.now(timezone.utc).isoformat())
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return {"id": comment.id, "user_id": comment.user_id, "content": comment.content, "created_at": comment.created_at}


@router.post("/{did}/photos")
async def upload_photo(did: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    dir_path = os.path.join(UPLOAD_DIR, str(did))
    os.makedirs(dir_path, exist_ok=True)
    token = secrets.token_hex(8)
    filename = f"{token}_{file.filename}"
    with open(os.path.join(dir_path, filename), "wb") as f:
        f.write(await file.read())
    photo = DeliveryPhoto(delivery_id=did, image_key=filename, created_at=datetime.now(timezone.utc).isoformat())
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return {"id": photo.id, "image_key": photo.image_key}


@router.get("/{did}/photos/{photo_id}/image")
async def get_photo(did: int, photo_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    photo = (await db.execute(select(DeliveryPhoto).where(DeliveryPhoto.id == photo_id))).scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=404, detail="사진을 찾을 수 없습니다")
    path = os.path.join(UPLOAD_DIR, str(did), photo.image_key)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    return FileResponse(path)
