"""add supply_order_items.pack_size_snapshot (발주서 인쇄 양식용 개수단위 스냅샷)

Revision ID: c2d8e6f4a1b3
Revises: a1c9e4f7b2d5
Create Date: 2026-07-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c2d8e6f4a1b3'
down_revision: Union[str, Sequence[str], None] = 'a1c9e4f7b2d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('supply_order_items', sa.Column('pack_size_snapshot', sa.Integer(), nullable=False, server_default='1'))


def downgrade() -> None:
    op.drop_column('supply_order_items', 'pack_size_snapshot')
