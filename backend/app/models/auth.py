from typing import Optional
from sqlalchemy import ForeignKey, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class GradeMaster(Base):
    """DB구성요청서 3-1 확정사항 2: 공통 등급표, 관리자가 추후 편집"""
    __tablename__ = "grade_master"
    __table_args__ = (
        CheckConstraint("grade_type IN ('discount','gift')", name="ck_grade_type"),
    )

    grade_code: Mapped[str] = mapped_column(primary_key=True)
    grade_type: Mapped[str] = mapped_column()
    label: Mapped[str] = mapped_column()
    discount_rate: Mapped[Optional[float]] = mapped_column(default=None)
    gift_policy_note: Mapped[Optional[str]] = mapped_column(default=None)
    sort_order: Mapped[int] = mapped_column(default=0)


class HospitalProfile(Base, TimestampMixin):
    """회원가입된 병원 '조직' 엔티티. users와 1:N (담당자 여러명 가능)."""
    __tablename__ = "hospital_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    hospital_name: Mapped[str] = mapped_column()
    hospital_type: Mapped[str] = mapped_column()  # 의원/병원/대학병원/동물병원
    hospital_dept: Mapped[Optional[str]] = mapped_column(default=None)  # 단일선택 텍스트, 직접입력 허용
    hospital_address: Mapped[Optional[str]] = mapped_column(default=None)  # v0.10: 수동입력
    hospital_tel: Mapped[Optional[str]] = mapped_column(default=None)
    business_reg_no: Mapped[Optional[str]] = mapped_column(default=None)
    ceo_name: Mapped[Optional[str]] = mapped_column(default=None)
    ceo_phone: Mapped[Optional[str]] = mapped_column(default=None)
    discount_grade_code: Mapped[Optional[str]] = mapped_column(
        ForeignKey("grade_master.grade_code"), default=None
    )
    gift_grade_code: Mapped[Optional[str]] = mapped_column(
        ForeignKey("grade_master.grade_code"), default=None
    )

    users: Mapped[list["User"]] = relationship(back_populates="hospital_profile")


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('songrim','hospital')", name="ck_user_role"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str] = mapped_column()
    display_name: Mapped[Optional[str]] = mapped_column(default=None)
    phone: Mapped[Optional[str]] = mapped_column(default=None)
    email: Mapped[Optional[str]] = mapped_column(default=None)
    role: Mapped[str] = mapped_column()  # songrim | hospital
    is_admin: Mapped[bool] = mapped_column(default=False)
    # role='hospital'일 때만 설정 (병원당 여러 담당자 계정 가능 → 1:N)
    hospital_profile_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("hospital_profiles.id"), default=None
    )

    hospital_profile: Mapped[Optional["HospitalProfile"]] = relationship(back_populates="users")
    staff_profile: Mapped[Optional["StaffProfile"]] = relationship(back_populates="user", uselist=False)


class Session(Base):
    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[str] = mapped_column()


class StaffProfile(Base, TimestampMixin):
    """송림 내부 직원 전용, users와 1:1"""
    __tablename__ = "staff_profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    department: Mapped[Optional[str]] = mapped_column(default=None)
    position: Mapped[Optional[str]] = mapped_column(default=None)
    note: Mapped[Optional[str]] = mapped_column(default=None)  # 특이사항

    user: Mapped["User"] = relationship(back_populates="staff_profile")


class SupplyPriceOverride(Base, TimestampMixin):
    """개별 병원 단위 소모품 가격 오버라이드 (등급기반 아님)"""
    __tablename__ = "supply_price_overrides"
    __table_args__ = (
        UniqueConstraint("catalog_id", "hospital_profile_id", name="uq_price_override"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    catalog_id: Mapped[int] = mapped_column(ForeignKey("supply_catalog.id"))
    hospital_profile_id: Mapped[int] = mapped_column(ForeignKey("hospital_profiles.id"))
    override_price: Mapped[int] = mapped_column()


class PagePermission(Base):
    """송림 내부 페이지 접근권한 (부서/직급 기준)"""
    __tablename__ = "page_permissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    department: Mapped[Optional[str]] = mapped_column(default=None)
    position: Mapped[Optional[str]] = mapped_column(default=None)
    page_key: Mapped[str] = mapped_column()
    can_access: Mapped[bool] = mapped_column(default=True)


class StorageFolderPermission(Base):
    """자료실 폴더 권한 (직급 단위만)"""
    __tablename__ = "storage_folder_permissions"
    __table_args__ = (
        CheckConstraint("permission_level IN ('view','edit')", name="ck_storage_perm_level"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    folder_path: Mapped[str] = mapped_column()
    position: Mapped[str] = mapped_column()
    permission_level: Mapped[str] = mapped_column()
