"""equipment: 심평원 전체 장비군(195 대분류) 수용

기존 equipment.category는 us/xray/ct/mri/bmd/carm 6종 코드로 CHECK 제약이 걸려 있었다.
심평원 '의료장비 상세 현황' 전체(195 대분류)를 담으려면 이 제약을 풀어야 하고, 한글 분류명을
화면에 그대로 쓰려면 이름 컬럼이 필요하다.

- category_name    : 장비대분류명 (예: '저주파자극기')
- category_code    : 장비대분류코드 (예: 'C108')
- subcategory_name : 장비세분류명 (예: '일반엑스선촬영장치(디지털)')

기존 6종은 category에 짧은 코드를 그대로 유지하고(기존 화면/영업지도가 이 값으로 필터한다)
category_name/category_code만 채운다. 신규 189종은 category에 장비대분류코드를 넣는다.

source에는 'hira_2025'(2025-12-31 스냅샷)를 추가한다 — 기존 연도별 import와 구분하기 위함.

Revision ID: e6c2a9f1d7b4
Revises: d4f8b2c6e1a9
Create Date: 2026-09-18
"""

from alembic import op
import sqlalchemy as sa

revision = "e6c2a9f1d7b4"
down_revision = "d4f8b2c6e1a9"
branch_labels = None
depends_on = None

# 기존 6종 -> (장비대분류명, 장비대분류코드). us는 심평원 세분류 '범용초음파영상진단기'(B30203)만
# 담고 있지만 대분류는 B302다 — 나머지 두 세분류는 별도 category로 들어간다(임포트 스크립트 참고).
LEGACY = {
    "us": ("초음파영상진단기", "B302"),
    "xray": ("일반엑스선촬영장치", "B101"),
    "ct": ("전산화단층촬영장치", "B108"),
    "mri": ("자기공명영상진단기", "B301"),
    "bmd": ("골밀도검사기", "B203"),
    "carm": ("C-Arm형 엑스선장치", "B106"),
}


def upgrade() -> None:
    op.add_column("equipment", sa.Column("category_name", sa.String(), nullable=True))
    op.add_column("equipment", sa.Column("category_code", sa.String(), nullable=True))
    op.add_column("equipment", sa.Column("subcategory_name", sa.String(), nullable=True))

    conn = op.get_bind()
    for cat, (name, code) in LEGACY.items():
        conn.execute(
            sa.text("UPDATE equipment SET category_name = :n, category_code = :c WHERE category = :cat"),
            {"n": name, "c": code, "cat": cat},
        )

    # SQLite는 CHECK 제약을 ALTER로 못 지운다 -> batch(테이블 재생성).
    with op.batch_alter_table("equipment") as batch:
        batch.drop_constraint("ck_equipment_category", type_="check")
        batch.drop_constraint("ck_equipment_source", type_="check")
        batch.create_check_constraint("ck_equipment_source", "source IN ('import','manual','hira_2025')")

    # 분류 목록을 DB에서 동적으로 뽑으므로(med_stats /meta) 인덱스만으로 끝나게 한다.
    op.create_index("idx_eq_cat_name", "equipment", ["category", "category_name"])
    # 분류별 집계(보유 기관 수/대수/모델 종수)와 모델명 부분일치 검색을 전부 커버링 인덱스 안에서
    # 끝내기 위한 인덱스. 임포트 후 2025년 행이 70만이라 테이블 랜덤 액세스가 생기면 급격히 느려진다.
    # (실측: /equipment/by-category 전국 1,890ms -> 207ms, 모델 LIKE 검색 959ms -> 66ms)
    op.create_index(
        "idx_eq_year_cat_cover", "equipment", ["year", "category", "hospital_id", "model", "eq_count"]
    )


def downgrade() -> None:
    op.drop_index("idx_eq_year_cat_cover", table_name="equipment")
    op.drop_index("idx_eq_cat_name", table_name="equipment")
    op.execute("DELETE FROM equipment WHERE source = 'hira_2025'")
    with op.batch_alter_table("equipment") as batch:
        batch.drop_constraint("ck_equipment_source", type_="check")
        batch.create_check_constraint("ck_equipment_source", "source IN ('import','manual')")
        batch.create_check_constraint(
            "ck_equipment_category", "category IN ('us','xray','ct','mri','bmd','carm')"
        )
    op.drop_column("equipment", "subcategory_name")
    op.drop_column("equipment", "category_code")
    op.drop_column("equipment", "category_name")
