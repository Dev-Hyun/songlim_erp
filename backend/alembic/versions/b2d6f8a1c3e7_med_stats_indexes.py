"""med stats indexes

의료기관 데이터 조회(장비 검색/개설 현황/분포 현황)에서 쓰는 집계용 인덱스.
- idx_eq_hosp_year: MIN/MAX(year) GROUP BY hospital_id WHERE source=import (개설 프록시) 커버링
- idx_eq_year_cat: 연도 기준 분류/제조사/모델 집계
- idx_hosp_sido_sigungu: 시도/시군구 분포 집계

Revision ID: b2d6f8a1c3e7
Revises: f7b2d4e9a3c1
Create Date: 2026-09-18
"""

from alembic import op

revision = "b2d6f8a1c3e7"
down_revision = "f7b2d4e9a3c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("idx_eq_hosp_year", "equipment", ["hospital_id", "year", "source"])
    op.create_index("idx_eq_year_cat", "equipment", ["year", "category"])
    op.create_index("idx_hosp_sido_sigungu", "hospitals", ["sido", "sigungu"])


def downgrade() -> None:
    op.drop_index("idx_hosp_sido_sigungu", table_name="hospitals")
    op.drop_index("idx_eq_year_cat", table_name="equipment")
    op.drop_index("idx_eq_hosp_year", table_name="equipment")
