from typing import Optional
from sqlalchemy import CheckConstraint, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Delivery(Base, TimestampMixin):
    """초음파 계약 현황 (레거시 명칭: 초음파 현황/납품현황). category는 현재 '초음파'만 실사용."""
    __tablename__ = "deliveries"
    __table_args__ = (
        CheckConstraint("site_type IN ('delivery','demo')", name="ck_delivery_site_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(default="초음파")
    hospital_name: Mapped[str] = mapped_column()
    hospital_type: Mapped[Optional[str]] = mapped_column(default=None)  # 의원/병원/종합병원
    installation_date: Mapped[Optional[str]] = mapped_column(default=None)  # delivery: 설치일자 / demo: DEMO 시작일자
    installation_location: Mapped[Optional[str]] = mapped_column(default=None)
    rep_doctor: Mapped[Optional[str]] = mapped_column(default=None)
    address: Mapped[Optional[str]] = mapped_column(default=None)
    person_in_charge: Mapped[Optional[str]] = mapped_column(default=None)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    site_type: Mapped[str] = mapped_column(default="delivery")  # delivery(납품&관리) | demo
    warranty_start: Mapped[Optional[str]] = mapped_column(default=None)  # delivery 전용
    warranty_end: Mapped[Optional[str]] = mapped_column(default=None)  # delivery: W/A 종료 / demo: DEMO 종료일자
    maintenance: Mapped[Optional[str]] = mapped_column(default=None)  # delivery 전용: O | X
    demo_result: Mapped[Optional[str]] = mapped_column(default=None)  # demo 전용: 예정 | 진행중 | 성공 | 실패

    items: Mapped[list["DeliveryItem"]] = relationship(back_populates="delivery", cascade="all, delete-orphan")
    photos: Mapped[list["DeliveryPhoto"]] = relationship(back_populates="delivery", cascade="all, delete-orphan")
    comments: Mapped[list["DeliveryComment"]] = relationship(back_populates="delivery", cascade="all, delete-orphan")


class DeliveryItem(Base):
    __tablename__ = "delivery_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    delivery_id: Mapped[int] = mapped_column(ForeignKey("deliveries.id", ondelete="CASCADE"))
    description: Mapped[Optional[str]] = mapped_column(default=None)
    serial_no: Mapped[Optional[str]] = mapped_column(default=None)
    price: Mapped[Optional[int]] = mapped_column(default=None)
    sys_id: Mapped[Optional[str]] = mapped_column(default=None)

    delivery: Mapped["Delivery"] = relationship(back_populates="items")


class DeliveryPhoto(Base):
    __tablename__ = "delivery_photos"
    __table_args__ = (Index("idx_delivery_photos_delivery", "delivery_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    delivery_id: Mapped[int] = mapped_column(ForeignKey("deliveries.id", ondelete="CASCADE"))
    image_key: Mapped[str] = mapped_column()
    created_at: Mapped[str] = mapped_column()

    delivery: Mapped["Delivery"] = relationship(back_populates="photos")


class DeliveryComment(Base):
    __tablename__ = "delivery_comments"
    __table_args__ = (Index("idx_delivery_comments_delivery", "delivery_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    delivery_id: Mapped[int] = mapped_column(ForeignKey("deliveries.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    content: Mapped[str] = mapped_column()
    created_at: Mapped[str] = mapped_column()

    delivery: Mapped["Delivery"] = relationship(back_populates="comments")
