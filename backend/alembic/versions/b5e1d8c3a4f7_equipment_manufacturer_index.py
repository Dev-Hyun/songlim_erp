"""equipment: 제조사 집계용 커버링 인덱스

/api/med/catalog/manufacturers 는 제조사 × 분류로 GROUP BY 하면서 모델·기관 distinct와
대수 합계를 한 번에 뽑는다. 기존 인덱스에는 manufacturer가 없어 idx_eq_year_cat로 연도 구간을
훑은 뒤 976K행 중 54만행을 임시 B-tree로 정렬했고, 실측 1,590ms가 나왔다.

(manufacturer, category, year, model, hospital_id, eq_count) 순서의 커버링 인덱스를 두면
제조사·분류 순서가 곧 GROUP BY 순서라 정렬이 사라지고 테이블 접근도 없어져 실측 64ms가 된다.
year를 세 번째에 둔 건 제조사 단위 집계와 제조사×분류 집계가 같은 인덱스를 쓰게 하기 위함이다.

인덱스 크기는 +21MB(데이터 314MB → 335MB). 제조사 적재(hira_2025 466K행)가 끝나면
이 인덱스가 없을 때의 비용은 지금의 두 배가 된다.

Revision ID: b5e1d8c3a4f7
Revises: a2f7c4e8b1d3
Create Date: 2026-09-19
"""

from alembic import op

revision = "b5e1d8c3a4f7"
down_revision = "a2f7c4e8b1d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "idx_eq_mfr_cover",
        "equipment",
        ["manufacturer", "category", "year", "model", "hospital_id", "eq_count"],
    )


def downgrade() -> None:
    op.drop_index("idx_eq_mfr_cover", table_name="equipment")
