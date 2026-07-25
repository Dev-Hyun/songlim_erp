"""add personal_memos table

Revision ID: b8f3d6a2c9e5
Revises: d5e9b1c3a7f4
Create Date: 2026-07-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8f3d6a2c9e5'
down_revision: Union[str, Sequence[str], None] = 'd5e9b1c3a7f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'personal_memos',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('content', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('idx_memo_user', 'personal_memos', ['user_id'])


def downgrade() -> None:
    op.drop_index('idx_memo_user', table_name='personal_memos')
    op.drop_table('personal_memos')
