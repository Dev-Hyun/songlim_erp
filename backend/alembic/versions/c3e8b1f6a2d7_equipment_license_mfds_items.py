"""equipment.license_no + mfds_device_items — 식약처 허가번호로 제조사 붙이기

심평원 '의료장비 상세 현황' CSV에는 `장비허가번호`(예: '수허13-302호')가 100% 채워져 있는데
임포트에서 버리고 있었다. 이 번호가 식약처 의료기기 품목허가 데이터의 `MEDDEV_ITEM_NO`와
같은 체계라서, 둘을 이어 붙이면 hira_2025 466K행에 제조사를 부여할 수 있다.

- equipment.license_no             : 정규화한 허가번호(공백 제거 + 지방청 접두어 제거)
- equipment.manufacturer_confidence: '확인'/'유력'/'추정' — 제조사 값의 근거 강도
- equipment.manufacturer_synced_at : 식약처 데이터 대조일(YYYY-MM-DD) — 근거 표기용
- mfds_device_items                : 식약처 품목허가 원장(213K건). item_sn(MDEQ_PRDLST_SN) 유니크.

주의: source='import' 레거시 510K행의 manufacturer는 사내 값이라 건드리지 않는다
(제조사 드롭다운이 그 값에 의존한다). 채우는 대상은 source='hira_2025'뿐이다.

Revision ID: c3e8b1f6a2d7
Revises: b5e1d8c3a4f7
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa

revision = "c3e8b1f6a2d7"
down_revision = "b5e1d8c3a4f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("equipment", sa.Column("license_no", sa.String(), nullable=True))
    op.add_column("equipment", sa.Column("manufacturer_confidence", sa.String(), nullable=True))
    op.add_column("equipment", sa.Column("manufacturer_synced_at", sa.String(), nullable=True))
    # 허가번호 -> 제조사 조인용. 매칭 배치가 이 인덱스로 466K행을 훑는다.
    op.create_index("idx_eq_license", "equipment", ["license_no"])

    op.create_table(
        "mfds_device_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("item_sn", sa.String(), nullable=False),      # MDEQ_PRDLST_SN 품목일련번호
        sa.Column("license_no", sa.String(), nullable=False),   # MEDDEV_ITEM_NO 정규화본
        sa.Column("maker_name", sa.String(), nullable=True),    # MNSC_NM 제조사
        sa.Column("client_name", sa.String(), nullable=True),   # MNFT_CLNT_NM 제조의뢰자
        sa.Column("item_name", sa.String(), nullable=True),     # PRDLST_NM 품목명
        sa.Column("type_info", sa.String(), nullable=True),     # TYPE_INFO 형명(모델)
        sa.Column("permit_date", sa.String(), nullable=True),   # PRMSN_YMD 허가일
        sa.Column("revoked_code", sa.String(), nullable=True),  # RTRCN_DSCTN_DIVS_CD 취하/취소 구분
        sa.Column("revoked_date", sa.String(), nullable=True),  # RTRCN_DSCTN_DT
        sa.Column("nation", sa.String(), nullable=True),        # MNSC_NATN_CD 제조국
        sa.Column("industry", sa.String(), nullable=True),      # INDT_NM 제조업/수입업
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("item_sn"),
    )
    op.create_index("idx_mfds_license", "mfds_device_items", ["license_no"])


def downgrade() -> None:
    op.drop_index("idx_mfds_license", table_name="mfds_device_items")
    op.drop_table("mfds_device_items")
    op.drop_index("idx_eq_license", table_name="equipment")
    op.drop_column("equipment", "manufacturer_synced_at")
    op.drop_column("equipment", "manufacturer_confidence")
    op.drop_column("equipment", "license_no")
