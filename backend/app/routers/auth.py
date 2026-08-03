import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import log_action
from app.database import get_db
from app.models import Hospital, HospitalProfile, Session, StaffProfile, User
from app.security import hash_password, new_session_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_NAME = "session_token"
# 배포 도메인이 HTTPS로 확정되면 .env에서 COOKIE_SECURE=true 로 전환
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"

# 직원(songrim) 회원가입 시 관리자 승인 없이 바로 로그인 가능하게 할지. 기본값은 자동승인(true).
# 다시 승인제로 되돌리려면 .env에 SIGNUP_AUTO_APPROVE_STAFF=false 를 넣고 백엔드를 재생성하면 된다.
STAFF_AUTO_APPROVE = os.environ.get("SIGNUP_AUTO_APPROVE_STAFF", "true").lower() in ("1", "true", "yes")

# 브루트포스 방어 — 특정 계정 대상 연속 로그인 실패 시 일시 잠금
MAX_FAILED_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_MINUTES = 15


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    session_token: Optional[str] = Cookie(None, alias=COOKIE_NAME),
) -> Optional[User]:
    if not session_token:
        return None
    # 세션+유저 조회를 쿼리 1번으로 합침 — 이 의존성은 로그인 필요한 모든 요청(특히 카탈로그 이미지처럼
    # 페이지 하나에서 수십~수백 번 호출되는 엔드포인트)마다 실행되므로 왕복 쿼리 수가 곧 체감 속도다.
    return (
        await db.execute(select(User).join(Session, Session.user_id == User.id).where(Session.token == session_token))
    ).scalar_one_or_none()


async def require_user(user: Optional[User] = Depends(get_current_user)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    return user


async def require_staff(user: User = Depends(require_user)) -> User:
    """송림 내부 직원 전용 — 병원 계정(role='hospital')은 공지사항/의료소식/소모품발주 3개 페이지만 접근 가능하므로
    나머지 모든 사내 전용 라우터(계약/납품/재고/CS/캘린더/커뮤니티/건의사항/운행일지/자료실/영업지도/통계)는 이 의존성으로 막는다."""
    if user.role != "songrim":
        raise HTTPException(status_code=403, detail="송림 직원만 접근 가능합니다")
    return user


class StaffRegisterIn(BaseModel):
    username: str
    password: str
    display_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    department: str
    position: str


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
        COOKIE_NAME, token, httponly=True, max_age=60 * 60 * 24 * 30,
        samesite="lax", secure=COOKIE_SECURE,
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
        is_approved=STAFF_AUTO_APPROVE,
    )
    db.add(user)
    await db.flush()
    db.add(StaffProfile(user_id=user.id, department=payload.department, position=payload.position))
    await db.commit()

    return {"id": user.id, "username": user.username, "pending_approval": not STAFF_AUTO_APPROVE}


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
        is_approved=False,
    )
    db.add(user)
    await db.commit()

    return {"id": user.id, "username": user.username, "pending_approval": True}


@router.post("/login")
async def login(payload: LoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.username == payload.username))).scalar_one_or_none()

    if user and user.locked_until:
        locked_until_dt = datetime.fromisoformat(user.locked_until)
        if datetime.now(timezone.utc) < locked_until_dt:
            remaining_min = max(1, int((locked_until_dt - datetime.now(timezone.utc)).total_seconds() // 60) + 1)
            raise HTTPException(status_code=429, detail=f"로그인 시도가 너무 많아 계정이 잠겼습니다. {remaining_min}분 후 다시 시도해주세요.")
        # 잠금 시간이 지났으면 카운터 초기화하고 이번 시도부터 다시 셈
        user.failed_login_count = 0
        user.locked_until = None

    if not user or not verify_password(payload.password, user.password_hash):
        if user:
            user.failed_login_count += 1
            if user.failed_login_count >= MAX_FAILED_LOGIN_ATTEMPTS:
                user.locked_until = (datetime.now(timezone.utc) + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)).isoformat()
            log_action(db, None, "login_failed", "user", user.id, detail=f"username={payload.username}, 실패 {user.failed_login_count}회")
            await db.commit()
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다")
    if not user.is_approved:
        raise HTTPException(status_code=403, detail="관리자 승인 대기 중인 계정입니다. 승인 후 다시 시도해주세요.")

    user.failed_login_count = 0
    user.locked_until = None
    log_action(db, user, "login_success")
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


def _serialize_me(user: User, staff: Optional[StaffProfile], hospital: Optional[HospitalProfile]) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "phone": user.phone,
        "email": user.email,
        "role": user.role,
        "is_admin": user.is_admin,
        "hospital_profile_id": user.hospital_profile_id,
        "department": staff.department if staff else None,
        "position": staff.position if staff else None,
        "hospital_name": hospital.hospital_name if hospital else None,
        "hospital_type": hospital.hospital_type if hospital else None,
        "hospital_dept": hospital.hospital_dept if hospital else None,
        "hospital_address": hospital.hospital_address if hospital else None,
        "hospital_tel": hospital.hospital_tel if hospital else None,
        "business_reg_no": hospital.business_reg_no if hospital else None,
        "ceo_name": hospital.ceo_name if hospital else None,
        "ceo_phone": hospital.ceo_phone if hospital else None,
    }


@router.get("/me")
async def get_me(user: Optional[User] = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not user:
        return {"user": None}

    staff = None
    hospital = None
    if user.role == "songrim":
        staff = (
            await db.execute(select(StaffProfile).where(StaffProfile.user_id == user.id))
        ).scalar_one_or_none()
    elif user.hospital_profile_id:
        hospital = (
            await db.execute(select(HospitalProfile).where(HospitalProfile.id == user.hospital_profile_id))
        ).scalar_one_or_none()

    return {"user": _serialize_me(user, staff, hospital)}


class ProfileUpdateIn(BaseModel):
    display_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    # role='songrim'
    department: Optional[str] = None
    position: Optional[str] = None
    # role='hospital'
    hospital_dept: Optional[str] = None
    hospital_address: Optional[str] = None
    hospital_tel: Optional[str] = None
    ceo_name: Optional[str] = None
    ceo_phone: Optional[str] = None


@router.patch("/me")
async def update_me(
    payload: ProfileUpdateIn,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """계정 설정에서 본인 정보 수정. 회원가입 때 입력한 항목만 대상이며,
    아이디/병원명/사업자번호처럼 신원 확인에 쓰이는 값은 여기서 바꾸지 않는다."""
    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.phone is not None:
        user.phone = payload.phone
    if payload.email is not None:
        user.email = payload.email

    staff = None
    hospital = None
    if user.role == "songrim":
        staff = (
            await db.execute(select(StaffProfile).where(StaffProfile.user_id == user.id))
        ).scalar_one_or_none()
        if staff:
            if payload.department is not None:
                staff.department = payload.department
            if payload.position is not None:
                staff.position = payload.position
    elif user.hospital_profile_id:
        hospital = (
            await db.execute(select(HospitalProfile).where(HospitalProfile.id == user.hospital_profile_id))
        ).scalar_one_or_none()
        if hospital:
            if payload.hospital_dept is not None:
                hospital.hospital_dept = payload.hospital_dept
            if payload.hospital_address is not None:
                hospital.hospital_address = payload.hospital_address
            if payload.hospital_tel is not None:
                hospital.hospital_tel = payload.hospital_tel
            if payload.ceo_name is not None:
                hospital.ceo_name = payload.ceo_name
            if payload.ceo_phone is not None:
                hospital.ceo_phone = payload.ceo_phone

    await db.commit()
    await db.refresh(user)
    return {"user": _serialize_me(user, staff, hospital)}
