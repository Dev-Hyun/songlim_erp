"""add supply_catalog.pack_size (개수단위 — 예: 100개입 박스 주문)

Revision ID: a1c9e4f7b2d5
Revises: e8f2a5c1b7d3
Create Date: 2026-07-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1c9e4f7b2d5'
down_revision: Union[str, Sequence[str], None] = 'e8f2a5c1b7d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('supply_catalog', sa.Column('pack_size', sa.Integer(), nullable=False, server_default='1'))


def downgrade() -> None:
    op.drop_column('supply_catalog', 'pack_size')
