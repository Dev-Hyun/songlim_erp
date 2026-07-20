"""소모품 발주 쇼핑몰 모듈 — catalog 확장, 즐겨찾기/카테고리권한/발주/원장 신규

Revision ID: 8a1c4f6e2b9d
Revises: 5e1f2a3b4c6d
Create Date: 2026-07-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8a1c4f6e2b9d'
down_revision: Union[str, Sequence[str], None] = '5e1f2a3b4c6d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('supply_catalog') as batch_op:
        batch_op.add_column(sa.Column('unit', sa.String(), nullable=False, server_default='개'))
        batch_op.add_column(sa.Column('description', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('image_key', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'))
        batch_op.alter_column('category', existing_type=sa.String(), nullable=False, server_default='기타')

    with op.batch_alter_table('hospital_profiles') as batch_op:
        batch_op.add_column(sa.Column('balance', sa.Integer(), nullable=False, server_default='0'))

    op.create_table(
        'supply_category_access',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('hospital_type', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('category', 'hospital_type', name='uq_supply_category_access'),
    )
    op.create_index('ix_supply_category_access_category', 'supply_category_access', ['category'])

    op.create_table(
        'supply_favorites',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('catalog_id', sa.Integer(), nullable=False),
        sa.Column('hospital_profile_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['catalog_id'], ['supply_catalog.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['hospital_profile_id'], ['hospital_profiles.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('catalog_id', 'hospital_profile_id', name='uq_supply_favorite'),
    )

    op.create_table(
        'supply_orders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('hospital_profile_id', sa.Integer(), nullable=False),
        sa.Column('ordered_by', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='접수'),
        sa.Column('tracking_number', sa.String(), nullable=True),
        sa.Column('total_amount', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('discount_rate_applied', sa.Float(), nullable=True),
        sa.Column('gift_note', sa.String(), nullable=True),
        sa.Column('tax_invoice_status', sa.String(), nullable=False, server_default='미발행'),
        sa.Column('staff_note', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint("status IN ('접수','출고','배송완료','직납출고','직납완료')", name='ck_supply_order_status'),
        sa.ForeignKeyConstraint(['hospital_profile_id'], ['hospital_profiles.id']),
        sa.ForeignKeyConstraint(['ordered_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'supply_order_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=False),
        sa.Column('catalog_id', sa.Integer(), nullable=True),
        sa.Column('name_snapshot', sa.String(), nullable=False),
        sa.Column('unit_snapshot', sa.String(), nullable=False, server_default='개'),
        sa.Column('unit_price_snapshot', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('qty', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('subtotal', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['order_id'], ['supply_orders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['catalog_id'], ['supply_catalog.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_supply_order_items_order', 'supply_order_items', ['order_id'])

    op.create_table(
        'hospital_ledger_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('hospital_profile_id', sa.Integer(), nullable=False),
        sa.Column('entry_type', sa.String(), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('memo', sa.String(), nullable=True),
        sa.Column('related_order_id', sa.Integer(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['hospital_profile_id'], ['hospital_profiles.id']),
        sa.ForeignKeyConstraint(['related_order_id'], ['supply_orders.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_ledger_hospital_date', 'hospital_ledger_entries', ['hospital_profile_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('idx_ledger_hospital_date', table_name='hospital_ledger_entries')
    op.drop_table('hospital_ledger_entries')
    op.drop_index('idx_supply_order_items_order', table_name='supply_order_items')
    op.drop_table('supply_order_items')
    op.drop_table('supply_orders')
    op.drop_table('supply_favorites')
    op.drop_index('ix_supply_category_access_category', table_name='supply_category_access')
    op.drop_table('supply_category_access')
    with op.batch_alter_table('hospital_profiles') as batch_op:
        batch_op.drop_column('balance')
    with op.batch_alter_table('supply_catalog') as batch_op:
        batch_op.drop_column('is_active')
        batch_op.drop_column('sort_order')
        batch_op.drop_column('image_key')
        batch_op.drop_column('description')
        batch_op.drop_column('unit')
