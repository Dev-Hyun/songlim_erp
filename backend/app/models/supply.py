from typing import Optional
from sqlalchemy import CheckConstraint, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class SupplyCatalog(Base, TimestampMixin):
    """소모품 발주 쇼핑몰 카탈로그. 레거시 supply_catalog(name/category/unit/price/description/image_key/sort_order/is_active) 계승."""
    __tablename__ = "supply_catalog"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column()
    spec: Mapped[Optional[str]] = mapped_column(default=None)
    category: Mapped[str] = mapped_column(default="기타")
    pack_size: Mapped[int] = mapped_column(default=1)  # 개수단위 — 예: 100개입 박스면 100, 낱개면 1
    unit: Mapped[str] = mapped_column(default="개")
    unit_price: Mapped[int] = mapped_column(default=0)  # pack_size 단위 묶음 기준 가격
    description: Mapped[Optional[str]] = mapped_column(default=None)
    image_key: Mapped[Optional[str]] = mapped_column(default=None)
    sort_order: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(default=True)

    favorites: Mapped[list["SupplyFavorite"]] = relationship(back_populates="catalog", cascade="all, delete-orphan")


class SupplyCategoryAccess(Base):
    """카테고리별 접근 허용 병원종별 목록 — 한 카테고리에 행이 하나라도 있으면 '허용목록'으로 취급되어
    나열된 hospital_type만 볼 수 있음 (예: 동물병원 카테고리는 hospital_type='동물병원' 행만 두면 그 계정만 노출).
    행이 전혀 없는 카테고리는 기본적으로 전체 공개."""
    __tablename__ = "supply_category_access"
    __table_args__ = (UniqueConstraint("category", "hospital_type", name="uq_supply_category_access"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(index=True)
    hospital_type: Mapped[str] = mapped_column()


class SupplyFavorite(Base):
    """병원 단위 즐겨찾기 (담당자 여러 명이 같은 병원 계정을 공유하므로 hospital_profile_id 기준)."""
    __tablename__ = "supply_favorites"
    __table_args__ = (UniqueConstraint("catalog_id", "hospital_profile_id", name="uq_supply_favorite"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    catalog_id: Mapped[int] = mapped_column(ForeignKey("supply_catalog.id", ondelete="CASCADE"))
    hospital_profile_id: Mapped[int] = mapped_column(ForeignKey("hospital_profiles.id"))

    catalog: Mapped["SupplyCatalog"] = relationship(back_populates="favorites")


class SupplyOrder(Base, TimestampMixin):
    """소모품 발주. status: 접수|출고|배송완료|직납출고|직납완료 (직납=제조/공급사가 병원에 직접 배송)."""
    __tablename__ = "supply_orders"
    __table_args__ = (
        CheckConstraint("status IN ('접수','출고','배송완료','직납출고','직납완료')", name="ck_supply_order_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    hospital_profile_id: Mapped[int] = mapped_column(ForeignKey("hospital_profiles.id"))
    ordered_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(default="접수")
    tracking_number: Mapped[Optional[str]] = mapped_column(default=None)
    total_amount: Mapped[int] = mapped_column(default=0)
    discount_rate_applied: Mapped[Optional[float]] = mapped_column(default=None)
    gift_note: Mapped[Optional[str]] = mapped_column(default=None)
    tax_invoice_status: Mapped[str] = mapped_column(default="미발행")  # 미발행|발행요청|발행완료
    staff_note: Mapped[Optional[str]] = mapped_column(default=None)

    items: Mapped[list["SupplyOrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class SupplyOrderItem(Base):
    """발주 품목 스냅샷 — 이후 카탈로그 가격/이름이 바뀌어도 발주 당시 값을 그대로 보존."""
    __tablename__ = "supply_order_items"
    __table_args__ = (Index("idx_supply_order_items_order", "order_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("supply_orders.id", ondelete="CASCADE"))
    catalog_id: Mapped[Optional[int]] = mapped_column(ForeignKey("supply_catalog.id"), default=None)
    name_snapshot: Mapped[str] = mapped_column()
    unit_snapshot: Mapped[str] = mapped_column(default="개")
    pack_size_snapshot: Mapped[int] = mapped_column(default=1)
    unit_price_snapshot: Mapped[int] = mapped_column(default=0)
    qty: Mapped[int] = mapped_column(default=1)
    subtotal: Mapped[int] = mapped_column(default=0)

    order: Mapped["SupplyOrder"] = relationship(back_populates="items")
