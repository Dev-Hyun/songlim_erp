"""equipment.source CHECK 에 odcloud 연도별 출처 허용 (+ 중복 제약 정리)

2019~2024년은 사내 레거시 경로로 들어와 6개 분류(us/xray/ct/mri/bmd/carm)뿐이었고 2025년만
심평원 원본 전체(196분류)가 있었다. 이 상태로 연도별 추이를 그리면 2025년에 장비가 급증한 것처럼
보이는 가짜 추세가 나온다. odcloud API(15051055)로 2023·2024를 전 분류로 마저 채우기 위해
source 허용값에 'odcloud_2023' / 'odcloud_2024' / 'odcloud_2025' 를 추가한다.

('odcloud_2022'는 넣지 않는다 — 2022년 원본에는 '암호화된 요양기호'가 없어 병원 매칭이 불가능하다.)

SQLite는 CHECK 제약을 ALTER 로 바꿀 수 없다. alembic의 batch_alter_table 에 table_args 를 주면
반영된 기존 제약 위에 새 제약이 **덧붙어** 같은 이름이 두 번 들어가므로 쓰지 않는다.
여기서는 목표 스키마로 새 테이블을 만들어 데이터를 옮기고 인덱스를 다시 거는 방식을 쓴다.
(이 마이그레이션은 이전에 중복 생성된 ck_equipment_source 를 하나로 정리하는 역할도 한다.)

Revision ID: f1a6c3d9e2b5
Revises: c3e8b1f6a2d7
Create Date: 2026-09-20

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'f1a6c3d9e2b5'
down_revision: Union[str, Sequence[str], None] = 'c3e8b1f6a2d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ALLOWED_NEW = "'import','manual','hira_2025','odcloud_2023','odcloud_2024','odcloud_2025'"
ALLOWED_OLD = "'import','manual','hira_2025'"

COLUMNS = (
    "id, hospital_id, category, year, manufacturer, model, eq_count, source, created_by, "
    "model_series, category_name, category_code, subcategory_name, license_no, "
    "manufacturer_confidence, manufacturer_synced_at"
)

INDEXES = [
    "CREATE INDEX idx_eq_year_cat_cover ON equipment (year, category, hospital_id, model, eq_count)",
    "CREATE INDEX idx_eq_hosp_year ON equipment (hospital_id, year, source)",
    "CREATE INDEX idx_eq_mfr_cover ON equipment (manufacturer, category, year, model, hospital_id, eq_count)",
    "CREATE INDEX idx_eq_year_cat ON equipment (year, category)",
    "CREATE INDEX idx_eq_cat_year ON equipment (category, year)",
    "CREATE INDEX idx_eq_hosp_cat ON equipment (hospital_id, category)",
    "CREATE INDEX idx_eq_series ON equipment (model_series)",
    "CREATE INDEX idx_eq_license ON equipment (license_no)",
    "CREATE INDEX idx_eq_cat_name ON equipment (category, category_name)",
]


def _rebuild(allowed: str) -> None:
    op.execute("PRAGMA foreign_keys=OFF")
    op.execute(
        "CREATE TABLE equipment_new ("
        " id INTEGER NOT NULL,"
        " hospital_id INTEGER NOT NULL,"
        " category VARCHAR NOT NULL,"
        " year INTEGER NOT NULL,"
        " manufacturer VARCHAR,"
        " model VARCHAR,"
        " eq_count INTEGER NOT NULL,"
        " source VARCHAR NOT NULL,"
        " created_by INTEGER,"
        " model_series VARCHAR,"
        " category_name VARCHAR,"
        " category_code VARCHAR,"
        " subcategory_name VARCHAR,"
        " license_no VARCHAR,"
        " manufacturer_confidence VARCHAR,"
        " manufacturer_synced_at VARCHAR,"
        " PRIMARY KEY (id),"
        " CONSTRAINT ck_equipment_source CHECK (source IN (" + allowed + ")),"
        " FOREIGN KEY(created_by) REFERENCES users (id),"
        " FOREIGN KEY(hospital_id) REFERENCES hospitals (id)"
        ")"
    )
    op.execute("INSERT INTO equipment_new (" + COLUMNS + ") SELECT " + COLUMNS + " FROM equipment")
    op.execute("DROP TABLE equipment")
    op.execute("ALTER TABLE equipment_new RENAME TO equipment")
    for ddl in INDEXES:
        op.execute(ddl)
    op.execute("PRAGMA foreign_keys=ON")


def upgrade() -> None:
    _rebuild(ALLOWED_NEW)


def downgrade() -> None:
    # 되돌리기 전에 새 출처 행이 남아 있으면 제약에 걸리므로 먼저 지운다.
    op.execute("DELETE FROM equipment WHERE source LIKE 'odcloud_%'")
    _rebuild(ALLOWED_OLD)
