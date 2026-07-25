from typing import Optional
from datetime import date
from sqlalchemy import ForeignKey, CheckConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Hospital(Base, TimestampMixin):
    """영업지도의 전국 병원 마스터 (심평원/동물병원 공공데이터 임포트 기반).
    hospital_profile_id가 채워진 경우 = 회원가입한 병원 → 지도에 회원 배지 표시."""
    __tablename__ = "hospitals"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column()
    name_norm: Mapped[Optional[str]] = mapped_column(default=None, index=True)
    type: Mapped[Optional[str]] = mapped_column(default=None)  # 요양기관종별
    sido: Mapped[Optional[str]] = mapped_column(default=None, index=True)
    sigungu: Mapped[Optional[str]] = mapped_column(default=None)
    address: Mapped[Optional[str]] = mapped_column(default=None)
    lat: Mapped[Optional[float]] = mapped_column(default=None)
    lng: Mapped[Optional[float]] = mapped_column(default=None)
    ykiho: Mapped[Optional[str]] = mapped_column(default=None)  # 심평원 고유코드 (공공데이터 임포트용, 회원가입과 무관)

    # 회원가입 연동 — 병원명 검색 매칭 성공 시 signup 흐름에서 채워짐
    hospital_profile_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("hospital_profiles.id"), default=None, index=True
    )

    equipment: Mapped[list["Equipment"]] = relationship(back_populates="hospital")
    sales_notes: Mapped[list["SalesNote"]] = relationship(back_populates="hospital")

    __table_args__ = (
        Index("idx_hosp_sido_norm", "sido", "name_norm"),
        Index("idx_hosp_ykiho", "ykiho"),
    )


class Equipment(Base):
    """장비 보유 현황. category: us(초음파)/xray/ct/mri/bmd(골밀도)/carm(C-Arm).
    source='manual'인 경우 회원가입 병원(동물병원, 2026 신규개원 등)에 직원이 직접 등록한 건."""
    __tablename__ = "equipment"
    __table_args__ = (
        CheckConstraint("category IN ('us','xray','ct','mri','bmd','carm')", name="ck_equipment_category"),
        CheckConstraint("source IN ('import','manual')", name="ck_equipment_source"),
        Index("idx_eq_hosp_cat", "hospital_id", "category"),
        Index("idx_eq_cat_year", "category", "year"),
        Index("idx_eq_series", "model_series"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    hospital_id: Mapped[int] = mapped_column(ForeignKey("hospitals.id"))
    category: Mapped[str] = mapped_column()
    year: Mapped[int] = mapped_column()
    manufacturer: Mapped[Optional[str]] = mapped_column(default=None)
    model: Mapped[Optional[str]] = mapped_column(default=None)
    model_series: Mapped[Optional[str]] = mapped_column(default=None)  # X-ray 전용 — 모델명 변형을 시리즈로 통합(app/manufacturer_map.py)
    eq_count: Mapped[int] = mapped_column(default=1)
    source: Mapped[str] = mapped_column(default="import")
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), default=None)

    hospital: Mapped["Hospital"] = relationship(back_populates="equipment")


class SalesNote(Base, TimestampMixin):
    """영업노트. 병원별/날짜별/작성자별로 모아볼 수 있어야 함."""
    __tablename__ = "sales_notes"
    __table_args__ = (
        Index("idx_notes_hosp", "hospital_id"),
        Index("idx_notes_user", "user_id"),
        Index("idx_notes_visit", "visit_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    hospital_id: Mapped[int] = mapped_column(ForeignKey("hospitals.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    visit_date: Mapped[Optional[date]] = mapped_column(default=None)
    content: Mapped[str] = mapped_column()

    hospital: Mapped["Hospital"] = relationship(back_populates="sales_notes")


class PersonalMemo(Base, TimestampMixin):
    """영업노트 탭의 개인 메모 — 제목 없이 내용만, 작성자 본인만 조회 가능(병원/날짜와 무관한 자유메모)."""
    __tablename__ = "personal_memos"
    __table_args__ = (Index("idx_memo_user", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    content: Mapped[str] = mapped_column()
