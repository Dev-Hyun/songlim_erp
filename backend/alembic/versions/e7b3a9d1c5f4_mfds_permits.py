"""mfds_permits — 식약처 품목허가 업체명(ENTRPS)·제조원(MANUF_NM) 대조표

mfds_device_items(MdeqPrdlstInfoService02)에는 허가 업체명이 없어 국내 제조 장비(제허·제인·제신…)의
제조사를 붙일 수 없었다. 15057456 API(MdlpPrdlstPrmisnInfoService06)에서 업체명·제조원을 받아
허가번호 → 표시용 제조사(equipment.brand)를 채운다.

기존 표를 넓히지 않고 새 표로 둔 이유: 출처 API와 갱신 주기가 달라 따로 다시 받을 수 있어야 하고,
기존 assign_equipment_manufacturer.py 의 '확인/유력/미확인' 판정이 그대로 유지돼야 한다.

적재: backend/scripts/sync_mfds_permits.py · 사용: backend/scripts/apply_brand.py

Revision ID: e7b3a9d1c5f4
Revises: b5d1e7a3c9f2
Create Date: 2026-11-18
"""

from alembic import op
import sqlalchemy as sa

revision = "e7b3a9d1c5f4"
down_revision = "b5d1e7a3c9f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mfds_permits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("item_sn", sa.String(), nullable=False),        # MDEQ_PRDLST_SN 품목일련번호
        sa.Column("license_no", sa.String(), nullable=True),      # PRDUCT_PRMISN_NO 정규화본
        sa.Column("entrps", sa.String(), nullable=True),          # ENTRPS 허가 업체
        sa.Column("manuf_nm", sa.String(), nullable=True),        # MANUF_NM 제조원
        sa.Column("client_name", sa.String(), nullable=True),     # MNFT_CLNT_NM 제조 의뢰자
        sa.Column("product", sa.String(), nullable=True),         # PRDUCT 품목명
        sa.Column("permit_date", sa.String(), nullable=True),     # PRMISN_DT 허가일
        sa.Column("revoked_code", sa.String(), nullable=True),    # RTRCN_DSCTN_DIVS_CD 취하/취소 구분
        sa.Column("changed_date", sa.String(), nullable=True),    # CHG_DT 변경일
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("item_sn"),
    )
    op.create_index("idx_mfds_permit_license", "mfds_permits", ["license_no"])


def downgrade() -> None:
    op.drop_index("idx_mfds_permit_license", table_name="mfds_permits")
    op.drop_table("mfds_permits")
