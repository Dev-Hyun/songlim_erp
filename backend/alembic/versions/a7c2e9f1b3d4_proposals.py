"""제안서 제작 — proposals, proposal_therapy_items, proposal_last_prices + 치료장비 초기 품목 28개

proposal_last_prices: 장비별 마지막 저장 금액(다음 제안서 기본값). 치료장비 초기 품목은 개비공 제안서의
단가·수량을 처음 기본값으로 넣는다(주요 장비의 처음 기본값은 코드 catalog.DEFAULT_PRICES).

초기 품목은 개비공 제안서의 치료장비 표(품명·모델·비고·Warranty)에 조사한 제조사와 새 사진을 붙인 것.
사진은 app/proposal/static/therapy/NN.png (image_key = 'seed/NN.png').

Revision ID: a7c2e9f1b3d4
Revises: f3b6c9d2a5e8
"""
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op

revision = "a7c2e9f1b3d4"
down_revision = "f3b6c9d2a5e8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "proposals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(), nullable=False, server_default="clinic"),
        sa.Column("hospital_name", sa.String(), nullable=False),
        sa.Column("doctor_name", sa.String(), nullable=False),
        sa.Column("proposal_date", sa.String(), nullable=False),
        sa.Column("rep_name", sa.String(), nullable=False, server_default=""),
        sa.Column("rep_title", sa.String(), nullable=False, server_default=""),
        sa.Column("rep_phone", sa.String(), nullable=False, server_default=""),
        sa.Column("design", sa.String(), nullable=False, server_default="A"),
        sa.Column("items", sa.String(), nullable=False, server_default="{}"),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("copied_from_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("design IN ('A','C')", name="ck_proposal_design"),
    )
    op.create_index("idx_proposals_updated", "proposals", ["updated_at"])

    items = op.create_table(
        "proposal_therapy_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("maker", sa.String(), nullable=True),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("warranty", sa.String(), nullable=True),
        sa.Column("image_key", sa.String(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    last = op.create_table(
        "proposal_last_prices",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    from app.proposal.catalog import THERAPY_SEED, THERAPY_SEED_PRICES

    now = datetime.now(timezone.utc)
    op.bulk_insert(items, [
        {**row, "maker": row["maker"] or None, "model": row["model"] or None, "note": row["note"] or None,
         "warranty": row["warranty"] or None, "sort_order": i, "is_active": True, "created_at": now, "updated_at": now}
        for i, row in enumerate(THERAPY_SEED, start=1)
    ])
    # 새 테이블이라 id는 1부터 순서대로 붙는다
    op.bulk_insert(last, [
        {"key": f"therapy:{i}", "price": price, "qty": qty, "updated_at": now}
        for i, (price, qty) in enumerate(THERAPY_SEED_PRICES, start=1) if price
    ])


def downgrade():
    op.drop_table("proposal_last_prices")
    op.drop_table("proposal_therapy_items")
    op.drop_index("idx_proposals_updated", table_name="proposals")
    op.drop_table("proposals")
