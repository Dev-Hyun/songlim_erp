"""add supply_catalog.sub_category

Revision ID: c7d1f4a9e3b8
Revises: b1c5e9a3d7f2
Create Date: 2026-07-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7d1f4a9e3b8'
down_revision: Union[str, Sequence[str], None] = 'b1c5e9a3d7f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('supply_catalog', sa.Column('sub_category', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('supply_catalog', 'sub_category')
