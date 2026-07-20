from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import InvEquipment, InvSupply, User
from app.routers.auth import require_user

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


class InvEquipmentIn(BaseModel):
    category: str  # 지멘스 | 타사
    item_type: str
    grade: Optional[str] = None
    name: str
    serial_no: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    manufacture_date: Optional[str] = None
    manufacturer: Optional[str] = None
    purchase_price: Optional[str] = None
    purchase_from: Optional[str] = None
    is_opened: bool = False


class InvSupplyIn(BaseModel):
    branch: str = "서울"
    number: Optional[int] = None
    name: str
    location: Optional[str] = None
    quantity: Optional[str] = None


def _eq_dict(e: InvEquipment) -> dict:
    return {
        "id": e.id, "category": e.category, "item_type": e.item_type, "grade": e.grade,
        "name": e.name, "serial_no": e.serial_no, "location": e.location, "notes": e.notes,
        "manufacture_date": e.manufacture_date, "manufacturer": e.manufacturer,
        "purchase_price": e.purchase_price, "purchase_from": e.purchase_from,
        "is_opened": e.is_opened, "updated_at": e.updated_at, "updated_by": e.updated_by,
    }


def _supply_dict(s: InvSupply) -> dict:
    return {
        "id": s.id, "branch": s.branch, "number": s.number, "name": s.name,
        "location": s.location, "quantity": s.quantity, "updated_at": s.updated_at, "updated_by": s.updated_by,
    }


@router.get("/equipment")
async def list_equipment(db: AsyncSession = Depends(get_db), category: Optional[str] = None):
    q = select(InvEquipment)
    if category:
        q = q.where(InvEquipment.category == category)
    q = q.order_by(InvEquipment.category, InvEquipment.item_type, InvEquipment.id)
    rows = (await db.execute(q)).scalars().all()
    return [_eq_dict(e) for e in rows]


@router.post("/equipment")
async def create_equipment(payload: InvEquipmentIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    e = InvEquipment(**payload.model_dump(), updated_at=datetime.now(timezone.utc).isoformat(), updated_by=user.id)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return _eq_dict(e)


@router.patch("/equipment/{eid}")
async def update_equipment(eid: int, payload: InvEquipmentIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    e = (await db.execute(select(InvEquipment).where(InvEquipment.id == eid))).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다")
    for k, v in payload.model_dump().items():
        setattr(e, k, v)
    e.updated_at = datetime.now(timezone.utc).isoformat()
    e.updated_by = user.id
    await db.commit()
    await db.refresh(e)
    return _eq_dict(e)


@router.delete("/equipment/{eid}")
async def delete_equipment(eid: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    e = (await db.execute(select(InvEquipment).where(InvEquipment.id == eid))).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다")
    await db.delete(e)
    await db.commit()
    return {"ok": True}


@router.get("/supplies")
async def list_supplies(db: AsyncSession = Depends(get_db), branch: Optional[str] = None):
    q = select(InvSupply)
    if branch:
        q = q.where(InvSupply.branch == branch)
    q = q.order_by(InvSupply.id)
    rows = (await db.execute(q)).scalars().all()
    return [_supply_dict(s) for s in rows]


@router.post("/supplies")
async def create_supply(payload: InvSupplyIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    s = InvSupply(**payload.model_dump(), updated_at=datetime.now(timezone.utc).isoformat(), updated_by=user.id)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return _supply_dict(s)


@router.patch("/supplies/{sid}")
async def update_supply(sid: int, payload: InvSupplyIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    s = (await db.execute(select(InvSupply).where(InvSupply.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다")
    for k, v in payload.model_dump().items():
        setattr(s, k, v)
    s.updated_at = datetime.now(timezone.utc).isoformat()
    s.updated_by = user.id
    await db.commit()
    await db.refresh(s)
    return _supply_dict(s)


@router.delete("/supplies/{sid}")
async def delete_supply(sid: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    s = (await db.execute(select(InvSupply).where(InvSupply.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다")
    await db.delete(s)
    await db.commit()
    return {"ok": True}
