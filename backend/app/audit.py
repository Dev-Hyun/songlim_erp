from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, User


def log_action(
    db: AsyncSession,
    actor: Optional[User],
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[object] = None,
    detail: Optional[str] = None,
) -> None:
    """감사로그 한 줄 추가. commit은 호출부가 이미 하는 db.commit()에 얹혀 나간다 —
    별도로 commit하지 않으므로 반드시 이 함수 호출 뒤에 await db.commit()이 있어야 한다."""
    db.add(AuditLog(
        actor_user_id=actor.id if actor else None,
        actor_name=(actor.display_name or actor.username) if actor else None,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        detail=detail,
        created_at=datetime.now(timezone.utc).isoformat(),
    ))
