"""drop supply_catalog_visibility (superseded by supply_category_access, unused)

Revision ID: ec4a88ab789e
Revises: 9e1a4d7c3f2b
Create Date: 2026-07-15
"""
from alembic import op
import sqlalchemy as sa

revision = "ec4a88ab789e"
down_revision = "9e1a4d7c3f2b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("supply_catalog_visibility")


def downgrade() -> None:
    op.create_table(
        "supply_catalog_visibility",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("catalog_id", sa.Integer(), sa.ForeignKey("supply_catalog.id"), nullable=False),
        sa.Column("hospital_profile_id", sa.Integer(), sa.ForeignKey("hospital_profiles.id"), nullable=False),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("catalog_id", "hospital_profile_id", name="uq_catalog_visibility"),
    )
