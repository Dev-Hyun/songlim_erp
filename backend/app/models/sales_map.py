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
    estb_date: Mapped[Optional[str]] = mapped_column(default=None)  # 개설일자 YYYY-MM-DD (심평원 estbDd)

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
    """장비 보유 현황.

    category: 레거시 6종은 짧은 코드(us/xray/ct/mri/bmd/carm)를 그대로 쓰고, 심평원 전체
    장비군 임포트로 들어온 나머지 분류는 장비대분류코드(예: 'C108')를 쓴다. 값 집합이 195종+로
    늘어나 CHECK 제약은 제거했다 — 표시용 한글명은 category_name에 들어 있다.
    source='manual'인 경우 회원가입 병원(동물병원, 2026 신규개원 등)에 직원이 직접 등록한 건,
    source='hira_2025'는 심평원 '의료장비 상세 현황' 2025-12-31 스냅샷."""
    __tablename__ = "equipment"
    __table_args__ = (
        CheckConstraint("source IN ('import','manual','hira_2025')", name="ck_equipment_source"),
        Index("idx_eq_hosp_cat", "hospital_id", "category"),
        Index("idx_eq_cat_year", "category", "year"),
        Index("idx_eq_series", "model_series"),
        Index("idx_eq_cat_name", "category", "category_name"),
        Index("idx_eq_year_cat_cover", "year", "category", "hospital_id", "model", "eq_count"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    hospital_id: Mapped[int] = mapped_column(ForeignKey("hospitals.id"))
    category: Mapped[str] = mapped_column()
    category_name: Mapped[Optional[str]] = mapped_column(default=None)  # 장비대분류명 (심평원 원본 한글명)
    category_code: Mapped[Optional[str]] = mapped_column(default=None)  # 장비대분류코드
    subcategory_name: Mapped[Optional[str]] = mapped_column(default=None)  # 장비세분류명
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
