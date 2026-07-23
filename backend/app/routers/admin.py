from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import GradeMaster, StaffProfile, User
from app.routers.auth import require_user
from app.security import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])


async def require_admin(user: User = Depends(require_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 접근 가능합니다")
    return user


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    rows = (await db.execute(select(User))).scalars().all()
    result = []
    for u in rows:
        staff = None
        if u.role == "songrim":
            staff = (await db.execute(select(StaffProfile).where(StaffProfile.user_id == u.id))).scalar_one_or_none()
        result.append({
            "id": u.id, "username": u.username, "display_name": u.display_name, "role": u.role,
            "is_admin": u.is_admin, "is_approved": u.is_approved,
            "department": staff.department if staff else None,
            "position": staff.position if staff else None,
        })
    return result


@router.patch("/users/{uid}/admin")
async def set_admin(uid: int, is_admin: bool, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    u = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    u.is_admin = is_admin
    await db.commit()
    return {"ok": True}


@router.patch("/users/{uid}/approve")
async def approve_user(uid: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    u = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    u.is_approved = True
    await db.commit()
    return {"ok": True}


class ResetPasswordIn(BaseModel):
    new_password: str


@router.post("/users/{uid}/reset-password")
async def reset_password(uid: int, payload: ResetPasswordIn, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    u = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    if len(payload.new_password) < 4:
        raise HTTPException(status_code=400, detail="비밀번호는 4자 이상이어야 합니다")
    u.password_hash = hash_password(payload.new_password)
    await db.commit()
    return {"ok": True}


class GradeMasterIn(BaseModel):
    grade_code: str
    grade_type: str  # discount | gift
    label: str
    discount_rate: Optional[float] = None
    gift_policy_note: Optional[str] = None
    sort_order: int = 0


@router.get("/grades")
async def list_grades(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(GradeMaster).order_by(GradeMaster.grade_type, GradeMaster.sort_order))).scalars().all()
    return [
        {"grade_code": g.grade_code, "grade_type": g.grade_type, "label": g.label,
         "discount_rate": g.discount_rate, "gift_policy_note": g.gift_policy_note, "sort_order": g.sort_order}
        for g in rows
    ]


@router.post("/grades")
async def create_grade(payload: GradeMasterIn, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    if payload.grade_type not in ("discount", "gift"):
        raise HTTPException(status_code=400, detail="grade_type은 discount 또는 gift여야 합니다")
    g = GradeMaster(**payload.model_dump())
    db.add(g)
    await db.commit()
    return {"grade_code": g.grade_code}


@router.patch("/grades/{grade_code}")
async def update_grade(grade_code: str, payload: GradeMasterIn, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    g = (await db.execute(select(GradeMaster).where(GradeMaster.grade_code == grade_code))).scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="등급을 찾을 수 없습니다")
    for k, v in payload.model_dump().items():
        if k != "grade_code":
            setattr(g, k, v)
    await db.commit()
    return {"ok": True}


@router.delete("/grades/{grade_code}")
async def delete_grade(grade_code: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    g = (await db.execute(select(GradeMaster).where(GradeMaster.grade_code == grade_code))).scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="등급을 찾을 수 없습니다")
    await db.delete(g)
    await db.commit()
    return {"ok": True}
