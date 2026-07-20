"""add hospitals rtree spatial index

Revision ID: 1615d2fb3c9c
Revises: 606416f06537
Create Date: 2026-07-13 16:31:39.424809

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1615d2fb3c9c'
down_revision: Union[str, Sequence[str], None] = '606416f06537'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        "CREATE VIRTUAL TABLE hospitals_rtree USING rtree(id, min_lat, max_lat, min_lng, max_lng)"
    )
    op.execute(
        """
        INSERT INTO hospitals_rtree (id, min_lat, max_lat, min_lng, max_lng)
        SELECT id, lat, lat, lng, lng FROM hospitals WHERE lat IS NOT NULL AND lng IS NOT NULL
        """
    )
    # hospitals 테이블 변경 시 rtree 인덱스 자동 동기화
    op.execute(
        """
        CREATE TRIGGER trg_hospitals_rtree_ai AFTER INSERT ON hospitals
        WHEN NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL
        BEGIN
            INSERT INTO hospitals_rtree (id, min_lat, max_lat, min_lng, max_lng)
            VALUES (NEW.id, NEW.lat, NEW.lat, NEW.lng, NEW.lng);
        END
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_hospitals_rtree_au AFTER UPDATE OF lat, lng ON hospitals
        BEGIN
            DELETE FROM hospitals_rtree WHERE id = NEW.id;
            INSERT INTO hospitals_rtree (id, min_lat, max_lat, min_lng, max_lng)
            SELECT NEW.id, NEW.lat, NEW.lat, NEW.lng, NEW.lng WHERE NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL;
        END
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_hospitals_rtree_ad AFTER DELETE ON hospitals
        BEGIN
            DELETE FROM hospitals_rtree WHERE id = OLD.id;
        END
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP TRIGGER IF EXISTS trg_hospitals_rtree_ad")
    op.execute("DROP TRIGGER IF EXISTS trg_hospitals_rtree_au")
    op.execute("DROP TRIGGER IF EXISTS trg_hospitals_rtree_ai")
    op.execute("DROP TABLE IF EXISTS hospitals_rtree")
