"""add manufacturer_snapshot and spec_snapshot to supply_order_items

Revision ID: f3a7c1d5e8b9
Revises: e2f6a8b4d9c1
Create Date: 2026-07-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f3a7c1d5e8b9'
down_revision: Union[str, Sequence[str], None] = 'e2f6a8b4d9c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('supply_order_items', sa.Column('manufacturer_snapshot', sa.String(), nullable=True))
    op.add_column('supply_order_items', sa.Column('spec_snapshot', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('supply_order_items', 'spec_snapshot')
    op.drop_column('supply_order_items', 'manufacturer_snapshot')
