"""add nonbiz_km to mileage_logs (국세청 운행기록부 대응)

Revision ID: 5e1f2a3b4c6d
Revises: 4d8b6e1a9c2f
Create Date: 2026-07-13 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5e1f2a3b4c6d'
down_revision: Union[str, Sequence[str], None] = '4d8b6e1a9c2f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('mileage_logs') as batch_op:
        batch_op.add_column(sa.Column('nonbiz_km', sa.Float(), nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('mileage_logs') as batch_op:
        batch_op.drop_column('nonbiz_km')
