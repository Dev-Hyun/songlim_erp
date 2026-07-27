"""add gift_tiers and gift_items tables

Revision ID: c4d8f1a6e2b7
Revises: b8f3d6a2c9e5
Create Date: 2026-07-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4d8f1a6e2b7'
down_revision: Union[str, Sequence[str], None] = 'b8f3d6a2c9e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'gift_tiers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('threshold_amount', sa.Integer(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_table(
        'gift_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('tier_id', sa.Integer(), sa.ForeignKey('gift_tiers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index('idx_gift_items_tier', 'gift_items', ['tier_id'])


def downgrade() -> None:
    op.drop_index('idx_gift_items_tier', table_name='gift_items')
    op.drop_table('gift_items')
    op.drop_table('gift_tiers')
