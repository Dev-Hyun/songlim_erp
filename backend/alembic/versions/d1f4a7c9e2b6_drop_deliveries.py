"""초음파 & 유지보수 현황 / DEMO 관리 제거 — deliveries 계열 4테이블 삭제

사용자 지시(2026-10-13): 두 화면을 기록 포함 전부 삭제. 이 화면들은 사이드바에서 사라지고
API(/api/deliveries)도 없어진다. 데이터는 되돌릴 수 없다(downgrade는 빈 테이블만 복원).

Revision ID: d1f4a7c9e2b6
Revises: c4e7a9b2d6f8
"""
import sqlalchemy as sa
from alembic import op

revision = "d1f4a7c9e2b6"
down_revision = "c4e7a9b2d6f8"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table("delivery_comments")
    op.drop_table("delivery_photos")
    op.drop_table("delivery_items")
    op.drop_table("deliveries")


def downgrade():
    op.create_table(
        "deliveries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("hospital_name", sa.String(), nullable=False),
        sa.Column("hospital_type", sa.String(), nullable=True),
        sa.Column("installation_date", sa.String(), nullable=True),
        sa.Column("installation_location", sa.String(), nullable=True),
        sa.Column("rep_doctor", sa.String(), nullable=True),
        sa.Column("address", sa.String(), nullable=True),
        sa.Column("person_in_charge", sa.String(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("site_type", sa.String(), nullable=False),
        sa.Column("warranty_start", sa.String(), nullable=True),
        sa.Column("warranty_end", sa.String(), nullable=True),
        sa.Column("maintenance", sa.String(), nullable=True),
        sa.Column("demo_result", sa.String(), nullable=True),
        sa.Column("equipment_kind", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("site_type IN ('delivery','demo')", name="ck_delivery_site_type"),
    )
    op.create_table(
        "delivery_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("delivery_id", sa.Integer(), sa.ForeignKey("deliveries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("serial_no", sa.String(), nullable=True),
        sa.Column("price", sa.Integer(), nullable=True),
        sa.Column("sys_id", sa.String(), nullable=True),
    )
    op.create_table(
        "delivery_photos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("delivery_id", sa.Integer(), sa.ForeignKey("deliveries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("image_key", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
    )
    op.create_index("idx_delivery_photos_delivery", "delivery_photos", ["delivery_id"])
    op.create_table(
        "delivery_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("delivery_id", sa.Integer(), sa.ForeignKey("deliveries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
    )
    op.create_index("idx_delivery_comments_delivery", "delivery_comments", ["delivery_id"])
