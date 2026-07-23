"""add users.notifications_seen_at (알림벨 읽음 시각)

Revision ID: b7d3f8a1c6e2
Revises: c2d8e6f4a1b3
Create Date: 2026-07-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7d3f8a1c6e2'
down_revision: Union[str, Sequence[str], None] = 'c2d8e6f4a1b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('notifications_seen_at', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'notifications_seen_at')
