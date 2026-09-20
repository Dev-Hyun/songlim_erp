"""localdata_clinics — 행안부 지방행정 인허가(개설·등록) 데이터

개설 현황 화면을 심평원 estb_date 기반에서 행안부 LOCALDATA 기반으로 갈아끼우기 위한 테이블.
심평원에는 폐업·휴업 일자가 없어서 '개설 추이' 아래쪽 막대(폐업/휴업/취소)를 만들 수 없었다.

MNG_NO(관리번호)를 유니크로 잡아 재수집이 멱등하게 돌아가게 한다.
집계 인덱스는 (category, opened_date) / (status_group, opened_date) /
(sido, sigungu, opened_date) / (dept, opened_date) + 폐업일·휴업시작일.

Revision ID: a2f7c4e8b1d3
Revises: e6c2a9f1d7b4
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa

revision = "a2f7c4e8b1d3"
down_revision = "e6c2a9f1d7b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "localdata_clinics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("mng_no", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("biz_type", sa.String(), nullable=True),
        sa.Column("opened_date", sa.String(), nullable=True),
        sa.Column("closed_date", sa.String(), nullable=True),
        sa.Column("revoked_date", sa.String(), nullable=True),
        sa.Column("suspend_start", sa.String(), nullable=True),
        sa.Column("suspend_end", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("status_code", sa.String(), nullable=True),
        sa.Column("status_group", sa.String(), nullable=True),
        sa.Column("detail_status", sa.String(), nullable=True),
        sa.Column("detail_status_code", sa.String(), nullable=True),
        sa.Column("road_addr", sa.String(), nullable=True),
        sa.Column("lot_addr", sa.String(), nullable=True),
        sa.Column("sido", sa.String(), nullable=True),
        sa.Column("sigungu", sa.String(), nullable=True),
        sa.Column("subjects", sa.String(), nullable=True),
        sa.Column("dept", sa.String(), nullable=True),
        sa.Column("tel", sa.String(), nullable=True),
        sa.Column("coord_x", sa.Float(), nullable=True),
        sa.Column("coord_y", sa.Float(), nullable=True),
        sa.Column("data_updated_at", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("mng_no"),
    )
    op.create_index("idx_ld_cat_opened", "localdata_clinics", ["category", "opened_date"])
    op.create_index("idx_ld_status_opened", "localdata_clinics", ["status_group", "opened_date"])
    op.create_index("idx_ld_sido_sigungu_opened", "localdata_clinics", ["sido", "sigungu", "opened_date"])
    op.create_index("idx_ld_dept_opened", "localdata_clinics", ["dept", "opened_date"])
    op.create_index("idx_ld_closed", "localdata_clinics", ["closed_date"])
    op.create_index("idx_ld_suspend", "localdata_clinics", ["suspend_start"])


def downgrade() -> None:
    op.drop_index("idx_ld_suspend", table_name="localdata_clinics")
    op.drop_index("idx_ld_closed", table_name="localdata_clinics")
    op.drop_index("idx_ld_dept_opened", table_name="localdata_clinics")
    op.drop_index("idx_ld_sido_sigungu_opened", table_name="localdata_clinics")
    op.drop_index("idx_ld_status_opened", table_name="localdata_clinics")
    op.drop_index("idx_ld_cat_opened", table_name="localdata_clinics")
    op.drop_table("localdata_clinics")
