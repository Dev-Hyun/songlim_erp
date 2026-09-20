"""equipment.brand 커버링 인덱스 — 표시용 제조사 집계용

brand 를 전 행에 채우면서 제조사 집계가 GROUP BY brand 로 바뀌었다.
manufacturer 선두 커버링 인덱스(idx_eq_mfr_cover)와 같은 모양을 brand 로도 만들어
제조사 목록이 64ms 대를 유지하게 한다(없으면 1.5초대로 돌아간다).

Revision ID: b7d2e9f4a1c8
Revises: a3f1c8d5b204
"""
from alembic import op

revision = "b7d2e9f4a1c8"
down_revision = "a3f1c8d5b204"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        "idx_eq_brand_cover", "equipment",
        ["brand", "category", "year", "model", "hospital_id", "eq_count"],
    )


def downgrade():
    op.drop_index("idx_eq_brand_cover", table_name="equipment")
