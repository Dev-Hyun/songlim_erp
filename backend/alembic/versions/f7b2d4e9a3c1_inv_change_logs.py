"""재고 셀 단위 변경 이력 테이블(inv_change_logs)

Revision ID: f7b2d4e9a3c1
Revises: a1c4e7d2f9b6
Create Date: 2026-09-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7b2d4e9a3c1'
down_revision: Union[str, Sequence[str], None] = 'a1c4e7d2f9b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'inv_change_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('table_name', sa.String(), nullable=False),
        sa.Column('row_id', sa.Integer(), nullable=False),
        sa.Column('category', sa.String(), nullable=True),
        sa.Column('row_label', sa.String(), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('field', sa.String(), nullable=True),
        sa.Column('old_value', sa.String(), nullable=True),
        sa.Column('new_value', sa.String(), nullable=True),
        sa.Column('actor_user_id', sa.Integer(), nullable=True),
        sa.Column('actor_name', sa.String(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_inv_change_logs_table_name'), 'inv_change_logs', ['table_name'], unique=False)
    op.create_index(op.f('ix_inv_change_logs_row_id'), 'inv_change_logs', ['row_id'], unique=False)
    op.create_index(op.f('ix_inv_change_logs_created_at'), 'inv_change_logs', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_inv_change_logs_created_at'), table_name='inv_change_logs')
    op.drop_index(op.f('ix_inv_change_logs_row_id'), table_name='inv_change_logs')
    op.drop_index(op.f('ix_inv_change_logs_table_name'), table_name='inv_change_logs')
    op.drop_table('inv_change_logs')
