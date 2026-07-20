"""add full legacy field set to deliveries/delivery_items

Revision ID: 7c2e5f9a1d3b
Revises: 9f3a1c7d2b4e
Create Date: 2026-07-13 20:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c2e5f9a1d3b'
down_revision: Union[str, Sequence[str], None] = '9f3a1c7d2b4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('deliveries') as batch_op:
        batch_op.add_column(sa.Column('hospital_type', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('installation_location', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('rep_doctor', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('address', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('person_in_charge', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('warranty_start', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('warranty_end', sa.String(), nullable=True))
    with op.batch_alter_table('delivery_items') as batch_op:
        batch_op.add_column(sa.Column('price', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('sys_id', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('delivery_items') as batch_op:
        batch_op.drop_column('sys_id')
        batch_op.drop_column('price')
    with op.batch_alter_table('deliveries') as batch_op:
        batch_op.drop_column('warranty_end')
        batch_op.drop_column('warranty_start')
        batch_op.drop_column('person_in_charge')
        batch_op.drop_column('address')
        batch_op.drop_column('rep_doctor')
        batch_op.drop_column('installation_location')
        batch_op.drop_column('hospital_type')
