"""add users.is_approved (signup approval), drop staff_profiles.note (특이사항)

Revision ID: d4a7c2e9f1b6
Revises: b3f6d1a9c8e2
Create Date: 2026-07-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4a7c2e9f1b6'
down_revision: Union[str, Sequence[str], None] = 'b3f6d1a9c8e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_approved', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.drop_column('staff_profiles', 'note')


def downgrade() -> None:
    op.add_column('staff_profiles', sa.Column('note', sa.String(), nullable=True))
    op.drop_column('users', 'is_approved')
