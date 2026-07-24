"""add supply_orders.order_request (hospital order note)

Revision ID: a4b8e2c6f1d9
Revises: f3a7c1d5e8b9
Create Date: 2026-07-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a4b8e2c6f1d9'
down_revision: Union[str, Sequence[str], None] = 'f3a7c1d5e8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('supply_orders', sa.Column('order_request', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('supply_orders', 'order_request')
