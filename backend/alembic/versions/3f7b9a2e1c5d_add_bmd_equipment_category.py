"""add bmd to equipment category check constraint

Revision ID: 3f7b9a2e1c5d
Revises: 8a1c4f6e2b9d
Create Date: 2026-07-15
"""
from alembic import op

revision = "3f7b9a2e1c5d"
down_revision = "8a1c4f6e2b9d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("equipment") as batch_op:
        batch_op.drop_constraint("ck_equipment_category", type_="check")
        batch_op.create_check_constraint(
            "ck_equipment_category", "category IN ('us','xray','ct','mri','bmd')"
        )


def downgrade() -> None:
    with op.batch_alter_table("equipment") as batch_op:
        batch_op.drop_constraint("ck_equipment_category", type_="check")
        batch_op.create_check_constraint(
            "ck_equipment_category", "category IN ('us','xray','ct','mri')"
        )
