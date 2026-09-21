from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class PushSubscription(Base, TimestampMixin):
    """PWA 웹 푸시 구독 정보. 브라우저(기기)당 1행 — 같은 사용자가 여러 기기/브라우저에서
    알림을 켜면 endpoint가 달라 여러 행이 생긴다. 발송은 app/push_notify.py에서 담당."""
    __tablename__ = "push_subscriptions"
    __table_args__ = (UniqueConstraint("endpoint", name="uq_push_subscription_endpoint"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    endpoint: Mapped[str] = mapped_column()
    p256dh: Mapped[str] = mapped_column()
    auth: Mapped[str] = mapped_column()
