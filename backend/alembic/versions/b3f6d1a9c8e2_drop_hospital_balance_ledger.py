"""drop hospital balance/ledger (선납충전잔액·미수금 개념 폐기)

Revision ID: b3f6d1a9c8e2
Revises: cab1863c0902
Create Date: 2026-07-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3f6d1a9c8e2'
down_revision: Union[str, Sequence[str], None] = 'cab1863c0902'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('hospital_ledger_entries')
    op.drop_column('hospital_profiles', 'balance')


def downgrade() -> None:
    op.add_column('hospital_profiles', sa.Column('balance', sa.Integer(), nullable=False, server_default='0'))
    op.create_table(
        'hospital_ledger_entries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('hospital_profile_id', sa.Integer(), sa.ForeignKey('hospital_profiles.id'), nullable=False),
        sa.Column('entry_type', sa.String(), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('memo', sa.String(), nullable=True),
        sa.Column('related_order_id', sa.Integer(), sa.ForeignKey('supply_orders.id'), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
    )
    op.create_index('idx_ledger_hospital_date', 'hospital_ledger_entries', ['hospital_profile_id', 'created_at'])
