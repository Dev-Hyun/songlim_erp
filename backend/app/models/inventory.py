from typing import Optional
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class InvEquipment(Base):
    """장비 재고. category='지멘스' → 초음파 재고 관리, category='타사' → 장비 재고 관리."""
    __tablename__ = "inv_equipment"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(default="지멘스")  # 지멘스 | 타사
    item_type: Mapped[str] = mapped_column(default="장비")  # 지멘스: 장비|EKG|프로브, 타사: 신품|중고|데모
    grade: Mapped[Optional[str]] = mapped_column(default=None)
    name: Mapped[str] = mapped_column()
    serial_no: Mapped[Optional[str]] = mapped_column(default=None)
    location: Mapped[Optional[str]] = mapped_column(default=None)
    notes: Mapped[Optional[str]] = mapped_column(default=None)
    manufacture_date: Mapped[Optional[str]] = mapped_column(default=None)
    manufacturer: Mapped[Optional[str]] = mapped_column(default=None)
    purchase_price: Mapped[Optional[str]] = mapped_column(default=None)
    purchase_from: Mapped[Optional[str]] = mapped_column(default=None)
    is_opened: Mapped[bool] = mapped_column(default=False)
    updated_at: Mapped[Optional[str]] = mapped_column(default=None)
    updated_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), default=None)


class InvSupply(Base):
    __tablename__ = "inv_supplies"

    id: Mapped[int] = mapped_column(primary_key=True)
    branch: Mapped[str] = mapped_column(default="서울")
    number: Mapped[Optional[int]] = mapped_column(default=None)
    name: Mapped[str] = mapped_column()
    location: Mapped[Optional[str]] = mapped_column(default=None)
    quantity: Mapped[Optional[str]] = mapped_column(default=None)
    updated_at: Mapped[Optional[str]] = mapped_column(default=None)
    updated_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), default=None)
