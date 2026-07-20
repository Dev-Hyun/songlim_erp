from typing import Optional
from sqlalchemy import CheckConstraint, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Contract(Base, TimestampMixin):
    """계약 진행 현황 — 판매계약서."""
    __tablename__ = "contracts"
    __table_args__ = (
        CheckConstraint("status IN ('진행중','보류','완료')", name="ck_contract_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column()
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    hospital_id: Mapped[Optional[int]] = mapped_column(ForeignKey("hospitals.id"), default=None)
    body: Mapped[Optional[str]] = mapped_column(default=None)
    status: Mapped[str] = mapped_column(default="진행중")

    contract_date: Mapped[Optional[str]] = mapped_column(default=None)
    buyer_hospital: Mapped[Optional[str]] = mapped_column(default=None)
    buyer_biz_no: Mapped[Optional[str]] = mapped_column(default=None)
    buyer_rep: Mapped[Optional[str]] = mapped_column(default=None)
    buyer_address: Mapped[Optional[str]] = mapped_column(default=None)
    buyer_phone: Mapped[Optional[str]] = mapped_column(default=None)
    buyer_mobile: Mapped[Optional[str]] = mapped_column(default=None)
    buyer_fax: Mapped[Optional[str]] = mapped_column(default=None)
    sale_amount: Mapped[int] = mapped_column(default=0)
    sale_amount_note: Mapped[Optional[str]] = mapped_column(default=None)
    etc_note: Mapped[Optional[str]] = mapped_column(default=None)
    customer_request: Mapped[Optional[str]] = mapped_column(default=None)
    install_date: Mapped[Optional[str]] = mapped_column(default=None)

    items: Mapped[list["ContractItem"]] = relationship(back_populates="contract", cascade="all, delete-orphan")
    photos: Mapped[list["ContractPhoto"]] = relationship(back_populates="contract", cascade="all, delete-orphan")
    comments: Mapped[list["ContractComment"]] = relationship(back_populates="contract", cascade="all, delete-orphan")


class ContractItem(Base):
    __tablename__ = "contract_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column()
    qty: Mapped[Optional[str]] = mapped_column(default=None)
    note: Mapped[Optional[str]] = mapped_column(default=None)
    sort_order: Mapped[int] = mapped_column(default=0)

    contract: Mapped["Contract"] = relationship(back_populates="items")


class ContractPhoto(Base):
    __tablename__ = "contract_photos"
    __table_args__ = (Index("idx_contract_photos_contract", "contract_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="CASCADE"))
    image_key: Mapped[str] = mapped_column()
    caption: Mapped[Optional[str]] = mapped_column(default=None)
    created_at: Mapped[str] = mapped_column()

    contract: Mapped["Contract"] = relationship(back_populates="photos")


class ContractComment(Base):
    __tablename__ = "contract_comments"
    __table_args__ = (Index("idx_contract_comments_contract", "contract_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column()
    created_at: Mapped[str] = mapped_column()

    contract: Mapped["Contract"] = relationship(back_populates="comments")
