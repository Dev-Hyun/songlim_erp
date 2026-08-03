"""drop suggestions table (건의사항 기능 완전 삭제)

Revision ID: e3a7c1f5b9d2
Revises: d7f2a9c4e1b8
Create Date: 2026-08-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3a7c1f5b9d2'
down_revision: Union[str, Sequence[str], None] = 'd7f2a9c4e1b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('suggestions')


def downgrade() -> None:
    op.create_table(
        'suggestions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('content', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='접수'),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint("status IN ('접수','검토중','반영완료')", name='ck_suggestion_status'),
    )
