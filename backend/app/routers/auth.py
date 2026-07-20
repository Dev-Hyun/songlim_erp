from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Hospital, HospitalProfile, Session, StaffProfile, User
from app.security import hash_password, new_session_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_NAME = "session_token"


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    session_token: Optional[str] = Cookie(None, alias=COOKIE_NAME),
) -> Optional[User]:
    if not session_token:
        return None
    sess = (await db.execute(select(Session).where(Session.token == session_token))).scalar_one_or_none()
    if not sess:
        return None
    return (await db.execute(select(User).where(User.id == sess.user_id))).scalar_one_or_none()


async def require_user(user: Optional[User] = Depends(get_current_user)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    return user


class StaffRegisterIn(BaseModel):
    username: str
    password: str
    display_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    department: str
    position: str
    note: Optional[str] = None


class HospitalRegisterIn(BaseModel):
    username: str
    password: str
    display_name: str  # 담당자 이름
    phone: Optional[str] = None  # 담당자 번호
    hospital_name: str
    hospital_type: str
    hospital_dept: Optional[str] = None
    hospital_address: Optional[str] = None
    hospital_tel: Optional[str] = None
    business_reg_no: Optional[str] = None
    ceo_name: Optional[str] = None
    ceo_phone: Optional[str] = None
    matched_ykiho: Optional[str] = None  # /api/hospital-search 결과에서 선택한 경우 hospitals.ykiho 연동용


class LoginIn(BaseModel):
    username: str
    password: str


async def _create_session(db: AsyncSession, response: Response, user: User):
    token = new_session_token()
    db.add(Session(token=token, user_id=user.id, created_at=datetime.now(timezone.utc).isoformat()))
    await db.commit()
    response.set_cookie(
        COOKIE_NAME, token, httponly=True, max_age=60 * 60 * 24 * 30, samesite="lax"
    )


@router.post("/register/staff")
async def register_staff(payload: StaffRegisterIn, response: Response, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(User).where(User.username == payload.username))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="이미 사용 중인 아이디입니다")

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        phone=payload.phone,
        email=payload.email,
        role="songrim",
    )
    db.add(user)
    await db.flush()
    db.add(StaffProfile(user_id=user.id, department=payload.department, position=payload.position, note=payload.note))
    await db.commit()
    await db.refresh(user)

    await _create_session(db, response, user)
    return {"id": user.id, "username": user.username}


@router.post("/register/hospital")
async def register_hospital(payload: HospitalRegisterIn, response: Response, db: AsyncSession = Depends(get_db)):
    """병원 회원가입. 병원명 검색(/api/hospital-search)에서 선택한 경우 matched_ykiho로 hospitals 행과 연동해
    영업지도에 회원 배지가 표시되도록 한다. 검색결과 없이 수동입력한 경우 연동 없이 프로필만 생성된다."""
    existing = (await db.execute(select(User).where(User.username == payload.username))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="이미 사용 중인 아이디입니다")

    profile = HospitalProfile(
        hospital_name=payload.hospital_name,
        hospital_type=payload.hospital_type,
        hospital_dept=payload.hospital_dept,
        hospital_address=payload.hospital_address,
        hospital_tel=payload.hospital_tel,
        business_reg_no=payload.business_reg_no,
        ceo_name=payload.ceo_name,
        ceo_phone=payload.ceo_phone,
    )
    db.add(profile)
    await db.flush()

    if payload.matched_ykiho:
        matched = (
            await db.execute(select(Hospital).where(Hospital.ykiho == payload.matched_ykiho))
        ).scalar_one_or_none()
        if matched and not matched.hospital_profile_id:
            matched.hospital_profile_id = profile.id

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        phone=payload.phone,
        role="hospital",
        hospital_profile_id=profile.id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    await _create_session(db, response, user)
    return {"id": user.id, "username": user.username}


@router.post("/login")
async def login(payload: LoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.username == payload.username))).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다")
    await _create_session(db, response, user)
    return {"id": user.id, "username": user.username, "role": user.role}


@router.post("/logout")
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    session_token: Optional[str] = Cookie(None, alias=COOKIE_NAME),
):
    if session_token:
        sess = (await db.execute(select(Session).where(Session.token == session_token))).scalar_one_or_none()
        if sess:
            await db.delete(sess)
            await db.commit()
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@router.get("/me")
async def get_me(user: Optional[User] = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user:
        return {"user": None}

    position = None
    hospital_name = None
    if user.role == "songrim":
        staff = (
            await db.execute(select(StaffProfile).where(StaffProfile.user_id == user.id))
        ).scalar_one_or_none()
        position = staff.position if staff else None
    elif user.hospital_profile_id:
        profile = (
            await db.execute(select(HospitalProfile).where(HospitalProfile.id == user.hospital_profile_id))
        ).scalar_one_or_none()
        hospital_name = profile.hospital_name if profile else None

    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "role": user.role,
            "is_admin": user.is_admin,
            "hospital_profile_id": user.hospital_profile_id,
            "position": position,
            "hospital_name": hospital_name,
        }
    }
