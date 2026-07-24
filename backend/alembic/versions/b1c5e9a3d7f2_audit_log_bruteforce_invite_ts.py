"""add audit_logs table, users brute-force fields, calendar_event_assignees.created_at

Revision ID: b1c5e9a3d7f2
Revises: a4b8e2c6f1d9
Create Date: 2026-07-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b1c5e9a3d7f2'
down_revision: Union[str, Sequence[str], None] = 'a4b8e2c6f1d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('failed_login_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('locked_until', sa.String(), nullable=True))
    op.add_column('calendar_event_assignees', sa.Column('created_at', sa.String(), nullable=True))
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('actor_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('actor_name', sa.String(), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('target_type', sa.String(), nullable=True),
        sa.Column('target_id', sa.String(), nullable=True),
        sa.Column('detail', sa.String(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
    )
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_audit_logs_created_at', table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_column('calendar_event_assignees', 'created_at')
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'failed_login_count')
