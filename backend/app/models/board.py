from typing import Optional
from sqlalchemy import CheckConstraint, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Notice(Base, TimestampMixin):
    """공지사항. notice_type: hospital(병원 공개) | internal(사내용)."""
    __tablename__ = "notices"
    __table_args__ = (CheckConstraint("notice_type IN ('hospital','internal')", name="ck_notice_type"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column()
    content: Mapped[str] = mapped_column()
    notice_type: Mapped[str] = mapped_column(default="hospital")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))


class CsTicket(Base, TimestampMixin):
    __tablename__ = "cs_tickets"
    __table_args__ = (CheckConstraint("status IN ('접수','처리중','처리완료')", name="ck_cs_status"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column()
    content: Mapped[str] = mapped_column()
    file_key: Mapped[Optional[str]] = mapped_column(default=None)
    file_name: Mapped[Optional[str]] = mapped_column(default=None)
    status: Mapped[str] = mapped_column(default="접수")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))

    comments: Mapped[list["CsComment"]] = relationship(back_populates="ticket", cascade="all, delete-orphan")


class CsComment(Base):
    __tablename__ = "cs_comments"
    __table_args__ = (Index("idx_cs_comments_ticket", "ticket_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("cs_tickets.id", ondelete="CASCADE"))
    content: Mapped[str] = mapped_column()
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[str] = mapped_column()

    ticket: Mapped["CsTicket"] = relationship(back_populates="comments")


class TechPost(Base, TimestampMixin):
    """기술 커뮤니티 게시판 (사내 정보 > 커뮤니티)."""
    __tablename__ = "tech_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column()
    category: Mapped[str] = mapped_column(default="general")
    content: Mapped[str] = mapped_column()
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    views: Mapped[int] = mapped_column(default=0)

    comments: Mapped[list["TechComment"]] = relationship(back_populates="post", cascade="all, delete-orphan")


class TechComment(Base):
    __tablename__ = "tech_comments"
    __table_args__ = (Index("idx_tech_comments_post", "post_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("tech_posts.id", ondelete="CASCADE"))
    content: Mapped[str] = mapped_column()
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[str] = mapped_column()

    post: Mapped["TechPost"] = relationship(back_populates="comments")


class Suggestion(Base, TimestampMixin):
    """건의사항 — 신규 모듈(레거시에 없음)."""
    __tablename__ = "suggestions"
    __table_args__ = (CheckConstraint("status IN ('접수','검토중','반영완료')", name="ck_suggestion_status"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column()
    content: Mapped[str] = mapped_column()
    status: Mapped[str] = mapped_column(default="접수")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
