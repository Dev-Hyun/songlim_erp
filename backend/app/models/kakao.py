from typing import Optional

from sqlalchemy import Index
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class KakaoOutbox(Base):
    """카카오톡 단톡방으로 보낼 알림 대기열.

    서버는 알림을 '만들어 쌓기만' 하고, 실제 발송은 사내 PC에서 도는 브리지 프로그램이
    이 대기열을 폴링해 가져가 카카오톡 PC 클라이언트를 제어해 보낸다. 서버가 PC로
    직접 접속할 필요가 없어 사내망에 포트를 열지 않아도 된다.

    발송 수단(카톡/메일/사내알림)을 나중에 갈아끼울 수 있도록 큐를 수단과 분리해 둔다.
    """
    __tablename__ = "kakao_outbox"
    __table_args__ = (Index("idx_kakao_outbox_status", "status", "id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column()  # supply_order | calendar_created | calendar_updated
    text: Mapped[str] = mapped_column()  # 단톡방에 그대로 찍힐 본문
    status: Mapped[str] = mapped_column(default="pending")  # pending | sent | failed
    attempts: Mapped[int] = mapped_column(default=0)
    last_error: Mapped[Optional[str]] = mapped_column(default=None)
    created_at: Mapped[str] = mapped_column()
    sent_at: Mapped[Optional[str]] = mapped_column(default=None)
