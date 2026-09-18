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


class InvChangeLog(Base):
    """재고 표의 셀 단위 변경 이력 — 구글 스프레드시트의 '변경 내역'에 해당.
    행이 삭제된 뒤에도 무엇이었는지 알 수 있도록 row_label(이름)을 스냅샷으로 남긴다.
    audit_logs와 분리한 이유: audit_logs는 detail이 자유 텍스트라 '어느 셀이 무엇에서 무엇으로'를
    행 단위로 조회할 수 없다."""
    __tablename__ = "inv_change_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    table_name: Mapped[str] = mapped_column(index=True)  # inv_equipment | inv_supplies
    row_id: Mapped[int] = mapped_column(index=True)
    category: Mapped[Optional[str]] = mapped_column(default=None)  # 지멘스 | 타사 (화면 단위 조회용)
    row_label: Mapped[Optional[str]] = mapped_column(default=None)
    action: Mapped[str] = mapped_column(default="update")  # create | update | delete
    field: Mapped[Optional[str]] = mapped_column(default=None)
    old_value: Mapped[Optional[str]] = mapped_column(default=None)
    new_value: Mapped[Optional[str]] = mapped_column(default=None)
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), default=None)
    actor_name: Mapped[Optional[str]] = mapped_column(default=None)
    created_at: Mapped[str] = mapped_column(index=True)
