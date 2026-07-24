from typing import Optional
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class AuditLog(Base):
    """로그인/권한변경/발주상태변경/단가·등급변경/게시글삭제 등 민감한 액션의 who/when/what 기록.
    actor_name은 스냅샷 — 나중에 계정이 삭제돼도 로그에는 당시 이름이 남는다."""
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), default=None)
    actor_name: Mapped[Optional[str]] = mapped_column(default=None)
    action: Mapped[str] = mapped_column()  # login_success | login_failed | role_change | order_status_change | price_change | post_delete 등
    target_type: Mapped[Optional[str]] = mapped_column(default=None)
    target_id: Mapped[Optional[str]] = mapped_column(default=None)
    detail: Mapped[Optional[str]] = mapped_column(default=None)
    created_at: Mapped[str] = mapped_column()
