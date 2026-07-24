"""merge supply_catalog.pack_size + unit into a single free-text unit field

Revision ID: d1e5f9a3c7b2
Revises: b7d3f8a1c6e2
Create Date: 2026-07-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd1e5f9a3c7b2'
down_revision: Union[str, Sequence[str], None] = 'b7d3f8a1c6e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 기존 pack_size(개수단위) 정보를 잃지 않도록 unit 필드에 합쳐넣은 뒤 컬럼 제거
    op.execute("""
        UPDATE supply_catalog
        SET unit = CASE WHEN pack_size > 1 THEN pack_size || '입/' || unit ELSE unit END
    """)
    op.execute("""
        UPDATE supply_order_items
        SET unit_snapshot = CASE WHEN pack_size_snapshot > 1 THEN pack_size_snapshot || '입/' || unit_snapshot ELSE unit_snapshot END
    """)
    with op.batch_alter_table('supply_catalog') as batch_op:
        batch_op.drop_column('pack_size')
    with op.batch_alter_table('supply_order_items') as batch_op:
        batch_op.drop_column('pack_size_snapshot')


def downgrade() -> None:
    with op.batch_alter_table('supply_catalog') as batch_op:
        batch_op.add_column(sa.Column('pack_size', sa.Integer(), nullable=False, server_default='1'))
    with op.batch_alter_table('supply_order_items') as batch_op:
        batch_op.add_column(sa.Column('pack_size_snapshot', sa.Integer(), nullable=False, server_default='1'))
