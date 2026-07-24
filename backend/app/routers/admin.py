from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import log_action
from app.database import get_db
from app.models import AuditLog, GradeMaster, Hospital, HospitalProfile, StaffProfile, User
from app.models.auth import Session as UserSession
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
        hospital_name = None
        if u.role == "songrim":
            staff = (await db.execute(select(StaffProfile).where(StaffProfile.user_id == u.id))).scalar_one_or_none()
        elif u.hospital_profile_id:
            hp = (await db.execute(select(HospitalProfile).where(HospitalProfile.id == u.hospital_profile_id))).scalar_one_or_none()
            hospital_name = hp.hospital_name if hp else None
        result.append({
            "id": u.id, "username": u.username, "display_name": u.display_name, "role": u.role,
            "is_admin": u.is_admin, "is_approved": u.is_approved,
            "department": staff.department if staff else None,
            "position": staff.position if staff else None,
            "hospital_name": hospital_name,
            "phone": u.phone, "email": u.email,
        })
    return result


@router.patch("/users/{uid}/admin")
async def set_admin(uid: int, is_admin: bool, db: AsyncSession = Depends(get_db), actor: User = Depends(require_admin)):
    u = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    u.is_admin = is_admin
    log_action(db, actor, "role_change", "user", uid, detail=f"{u.username}: is_admin={is_admin}")
    await db.commit()
    return {"ok": True}


@router.patch("/users/{uid}/approve")
async def approve_user(uid: int, db: AsyncSession = Depends(get_db), actor: User = Depends(require_admin)):
    u = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    u.is_approved = True
    log_action(db, actor, "role_change", "user", uid, detail=f"{u.username}: 계정 승인")
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


@router.delete("/users/{uid}")
async def delete_user(uid: int, db: AsyncSession = Depends(get_db), me: User = Depends(require_admin)):
    """계정 삭제(테스트 계정 정리용). 세션/직원프로필/병원프로필까지 함께 정리하고,
    병원프로필이 영업지도 병원과 연동돼 있었다면 그 연동도 해제한다."""
    if uid == me.id:
        raise HTTPException(status_code=400, detail="본인 계정은 삭제할 수 없습니다")
    u = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

    hp_id = u.hospital_profile_id
    await db.execute(delete(UserSession).where(UserSession.user_id == uid))
    await db.execute(delete(StaffProfile).where(StaffProfile.user_id == uid))
    await db.execute(delete(User).where(User.id == uid))
    if hp_id:
        others = (await db.execute(select(User).where(User.hospital_profile_id == hp_id))).scalars().all()
        if not others:
            matched = (await db.execute(select(Hospital).where(Hospital.hospital_profile_id == hp_id))).scalars().all()
            for m in matched:
                m.hospital_profile_id = None
            await db.execute(delete(HospitalProfile).where(HospitalProfile.id == hp_id))
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


@router.get("/audit-logs")
async def list_audit_logs(
    db: AsyncSession = Depends(get_db),
    action: Optional[str] = None,
    limit: int = 100,
    _: User = Depends(require_admin),
):
    """로그인/권한변경/발주상태변경/단가변경/게시글삭제 등 감사로그 조회 (관리자 전용)."""
    q = select(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        q = q.where(AuditLog.action == action)
    rows = (await db.execute(q.limit(min(limit, 500)))).scalars().all()
    return [
        {"id": a.id, "actor_name": a.actor_name, "action": a.action, "target_type": a.target_type,
         "target_id": a.target_id, "detail": a.detail, "created_at": a.created_at}
        for a in rows
    ]
