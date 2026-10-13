"""재고 행 순서(sort_order) — 행을 위/아래로 옮길 수 있게

기존 행은 id 순서를 그대로 물려받는다. 새 행은 생성 시 id 값을 받는다(= 맨 아래).

Revision ID: f3b6c9d2a5e8
Revises: e2a5c8d1f4b7
"""
import sqlalchemy as sa
from alembic import op

revision = "f3b6c9d2a5e8"
down_revision = "e2a5c8d1f4b7"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("inv_equipment") as batch_op:
        batch_op.add_column(sa.Column("sort_order", sa.Integer(), nullable=True))
    op.execute("UPDATE inv_equipment SET sort_order = id")


def downgrade():
    with op.batch_alter_table("inv_equipment") as batch_op:
        batch_op.drop_column("sort_order")
