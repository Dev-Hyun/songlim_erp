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

    assignees: Mapped[list["CalendarEventAssignee"]] = relationship(back_populates="event", cascade="all, delete-orphan")
    teams: Mapped[list["CalendarEventTeam"]] = relationship(back_populates="event", cascade="all, delete-orphan")


class CalendarEventAssignee(Base):
    __tablename__ = "calendar_event_assignees"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("calendar_events.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[Optional[str]] = mapped_column(default=None)  # 초대(할당)된 시각 — 알림 판단 기준

    event: Mapped["CalendarEvent"] = relationship(back_populates="assignees")


class CalendarEventTeam(Base):
    __tablename__ = "calendar_event_teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("calendar_events.id", ondelete="CASCADE"))
    team: Mapped[str] = mapped_column()

    event: Mapped["CalendarEvent"] = relationship(back_populates="teams")
