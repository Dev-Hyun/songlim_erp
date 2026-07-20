"""rename cs_tickets status value 완료 -> 처리완료

Revision ID: 9f3a1c7d2b4e
Revises: 8be9d5d2edd8
Create Date: 2026-07-13 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9f3a1c7d2b4e'
down_revision: Union[str, Sequence[str], None] = '8be9d5d2edd8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE cs_tickets SET status = '처리완료' WHERE status = '완료'")
    with op.batch_alter_table('cs_tickets') as batch_op:
        batch_op.drop_constraint('ck_cs_status', type_='check')
        batch_op.create_check_constraint('ck_cs_status', "status IN ('접수','처리중','처리완료')")


def downgrade() -> None:
    op.execute("UPDATE cs_tickets SET status = '완료' WHERE status = '처리완료'")
    with op.batch_alter_table('cs_tickets') as batch_op:
        batch_op.drop_constraint('ck_cs_status', type_='check')
        batch_op.create_check_constraint('ck_cs_status', "status IN ('접수','처리중','완료')")
