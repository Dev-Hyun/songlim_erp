from typing import Optional
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column()
    start_at: Mapped[str] = mapped_column()
    end_at: Mapped[Optional[str]] = mapped_column(default=None)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    is_shared: Mapped[bool] = mapped_column(default=False)
    google_event_id: Mapped[Optional[str]] = mapped_column(default=None)  # 구글 캘린더 연동 시 대응되는 이벤트 ID

    assignees: Mapped[list["CalendarEventAssignee"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    teams: Mapped[list["CalendarEventTeam"]] = relationship(back_populates="event", cascade="all, delete-orphan")


class GoogleCalendarLink(Base):
    """직원 개인 구글 계정과의 캘린더 연동 정보 (users와 1:1)"""
    __tablename__ = "google_calendar_links"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    google_calendar_id: Mapped[str] = mapped_column()  # 연동 전용 보조 캘린더 ID
    access_token: Mapped[str] = mapped_column()
    refresh_token: Mapped[str] = mapped_column()
    token_expiry: Mapped[str] = mapped_column()
    sync_token: Mapped[Optional[str]] = mapped_column(default=None)  # 증분 동기화용
    created_at: Mapped[str] = mapped_column()
    updated_at: Mapped[str] = mapped_column()


class CalendarEventAssignee(Base):
    __tablename__ = "calendar_event_assignees"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("calendar_events.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    event: Mapped["CalendarEvent"] = relationship(back_populates="assignees")


class CalendarEventTeam(Base):
    __tablename__ = "calendar_event_teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("calendar_events.id", ondelete="CASCADE"))
    team: Mapped[str] = mapped_column()

    event: Mapped["CalendarEvent"] = relationship(back_populates="teams")
