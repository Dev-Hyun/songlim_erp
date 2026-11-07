from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, utcnow


class Proposal(Base, TimestampMixin):
    """견적 제안서. 고른 장비와 입력값은 items(JSON 문자열)에 통째로 둔다 — 카테고리마다 입력 형태가 달라서."""
    __tablename__ = "proposals"
    __table_args__ = (
        CheckConstraint("design IN ('A','C')", name="ck_proposal_design"),
        Index("idx_proposals_updated", "updated_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(default="clinic")  # clinic(개원의) — 기타 제안서 대비
    hospital_name: Mapped[str] = mapped_column()
    doctor_name: Mapped[str] = mapped_column()
    proposal_date: Mapped[str] = mapped_column()  # YYYY-MM-DD
    rep_name: Mapped[str] = mapped_column(default="")
    rep_title: Mapped[str] = mapped_column(default="")
    rep_phone: Mapped[str] = mapped_column(default="")
    design: Mapped[str] = mapped_column(default="A")
    items: Mapped[str] = mapped_column(default="{}")
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    copied_from_id: Mapped[Optional[int]] = mapped_column(default=None)


class ProposalTherapyItem(Base, TimestampMixin):
    """치료장비 품목(관리 화면에서 수정). 단가는 저장하지 않는다 — 제안서마다 입력."""
    __tablename__ = "proposal_therapy_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column()
    maker: Mapped[Optional[str]] = mapped_column(default=None)
    model: Mapped[Optional[str]] = mapped_column(default=None)
    note: Mapped[Optional[str]] = mapped_column(default=None)
    warranty: Mapped[Optional[str]] = mapped_column(default=None)
    # seed/NN.png = 기본 사진(app/proposal/static/therapy), up/<hex>.png = 업로드 사진(uploads/proposal_therapy)
    image_key: Mapped[Optional[str]] = mapped_column(default=None)
    sort_order: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(default=True)


class ProposalLastPrice(Base):
    """장비·옵션·치료장비별 '마지막으로 저장한 금액' — 다음 제안서에서 그 장비를 고를 때 기본값으로 쓴다.
    키 형식은 app.proposal.catalog.DEFAULT_PRICES 주석 참고(치료장비는 therapy:<품목 id>, 수량도 함께)."""
    __tablename__ = "proposal_last_prices"

    key: Mapped[str] = mapped_column(primary_key=True)
    price: Mapped[int] = mapped_column()
    qty: Mapped[Optional[int]] = mapped_column(default=None)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
