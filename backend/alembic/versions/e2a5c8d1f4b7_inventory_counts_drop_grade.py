"""초음파 재고 개편 — 등급 칸 삭제, EKG→ECG CABLE, 개수 관리(LUMOS·쉬스) 테이블 신설

- inv_equipment.grade 삭제(사용자 지시: 등급 부분 삭제). 과거 변경 이력(inv_change_logs,
  field='grade')은 그대로 남는다.
- 지멘스 구분 'EKG' → 'ECG CABLE' 로 이름만 바꾼다(행은 유지).
- inv_count_stock: 품목(LUMOS/쉬스) × 사무실(대전/대구/서울)별 보유·사용 개수. 초기값은 0/0이고
  ADMIN이 화면에서 넣는다.
- inv_count_logs: '사용하기'를 누를 때마다 1줄, ADMIN이 초기 수량을 바꿀 때 1줄.

Revision ID: e2a5c8d1f4b7
Revises: d1f4a7c9e2b6
"""
import sqlalchemy as sa
from alembic import op

revision = "e2a5c8d1f4b7"
down_revision = "d1f4a7c9e2b6"
branch_labels = None
depends_on = None

OFFICES = ("대전", "대구", "서울")
ITEMS = ("LUMOS", "쉬스")


def upgrade():
    with op.batch_alter_table("inv_equipment") as batch_op:
        batch_op.drop_column("grade")
    op.execute("UPDATE inv_equipment SET item_type = 'ECG CABLE' WHERE item_type = 'EKG'")
    op.execute("UPDATE inv_change_logs SET old_value = 'ECG CABLE' WHERE field = 'item_type' AND old_value = 'EKG'")
    op.execute("UPDATE inv_change_logs SET new_value = 'ECG CABLE' WHERE field = 'item_type' AND new_value = 'EKG'")

    op.create_table(
        "inv_count_stock",
        sa.Column("item", sa.String(), primary_key=True),
        sa.Column("office", sa.String(), primary_key=True),
        sa.Column("on_hand", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.String(), nullable=True),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    for item in ITEMS:
        for office in OFFICES:
            op.execute(f"INSERT INTO inv_count_stock (item, office, on_hand, used) VALUES ('{item}', '{office}', 0, 0)")

    op.create_table(
        "inv_count_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("item", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),  # use | undone | adjust
        sa.Column("office", sa.String(), nullable=False),
        sa.Column("used_on", sa.String(), nullable=True),
        sa.Column("site", sa.String(), nullable=True),
        sa.Column("professor", sa.String(), nullable=True),
        sa.Column("procedure", sa.String(), nullable=True),
        sa.Column("staff_name", sa.String(), nullable=True),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("on_hand_after", sa.Integer(), nullable=False),
        sa.Column("used_after", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("actor_name", sa.String(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
    )
    op.create_index("ix_inv_count_logs_item", "inv_count_logs", ["item"])
    op.create_index("ix_inv_count_logs_office", "inv_count_logs", ["office"])
    op.create_index("ix_inv_count_logs_created_at", "inv_count_logs", ["created_at"])


def downgrade():
    op.drop_index("ix_inv_count_logs_created_at", table_name="inv_count_logs")
    op.drop_index("ix_inv_count_logs_office", table_name="inv_count_logs")
    op.drop_index("ix_inv_count_logs_item", table_name="inv_count_logs")
    op.drop_table("inv_count_logs")
    op.drop_table("inv_count_stock")
    op.execute("UPDATE inv_equipment SET item_type = 'EKG' WHERE item_type = 'ECG CABLE'")
    with op.batch_alter_table("inv_equipment") as batch_op:
        batch_op.add_column(sa.Column("grade", sa.String(), nullable=True))
