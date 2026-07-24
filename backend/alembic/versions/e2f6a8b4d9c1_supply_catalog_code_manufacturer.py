"""add supply_catalog.code and manufacturer

Revision ID: e2f6a8b4d9c1
Revises: d1e5f9a3c7b2
Create Date: 2026-07-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e2f6a8b4d9c1'
down_revision: Union[str, Sequence[str], None] = 'd1e5f9a3c7b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('supply_catalog', sa.Column('code', sa.String(), nullable=True))
    op.add_column('supply_catalog', sa.Column('manufacturer', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('supply_catalog', 'manufacturer')
    op.drop_column('supply_catalog', 'code')
