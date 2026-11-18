"""식약처 의료기기 품목허가 원장 — 심평원 장비의 제조사를 알아내기 위한 대조표.

심평원 '의료장비 상세 현황'에는 제조사 컬럼이 없고 `장비허가번호`만 있다. 식약처 품목허가
데이터(`MEDDEV_ITEM_NO`)가 같은 허가번호 체계를 쓰므로, 번호를 정규화해 이어 붙이면
장비 1행마다 제조사를 붙일 수 있다.

원천: https://apis.data.go.kr/1471000/MdeqPrdlstInfoService02/getMdeqPrdlstInfoInq02 (213K건)
적재: backend/scripts/sync_mfds_device_makers.py
사용: backend/scripts/assign_equipment_manufacturer.py
"""

from typing import Optional

from sqlalchemy import Index
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class MfdsDeviceItem(Base, TimestampMixin):
    """식약처 품목허가 1건. 고유키는 품목일련번호(MDEQ_PRDLST_SN).

    같은 license_no가 여러 행에 걸릴 수 있다(한 허가번호에 형명이 여러 개 묶인 경우).
    제조사가 갈리는지 여부가 제조사 부여 신뢰도('확인'/'유력')를 가른다.
    """

    __tablename__ = "mfds_device_items"
    __table_args__ = (Index("idx_mfds_license", "license_no"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    item_sn: Mapped[str] = mapped_column(unique=True)          # MDEQ_PRDLST_SN
    license_no: Mapped[str] = mapped_column()                  # MEDDEV_ITEM_NO 정규화본
    maker_name: Mapped[Optional[str]] = mapped_column(default=None)    # MNSC_NM 제조사
    client_name: Mapped[Optional[str]] = mapped_column(default=None)   # MNFT_CLNT_NM 제조의뢰자
    item_name: Mapped[Optional[str]] = mapped_column(default=None)     # PRDLST_NM 품목명
    type_info: Mapped[Optional[str]] = mapped_column(default=None)     # TYPE_INFO 형명(모델)
    permit_date: Mapped[Optional[str]] = mapped_column(default=None)   # PRMSN_YMD
    revoked_code: Mapped[Optional[str]] = mapped_column(default=None)  # RTRCN_DSCTN_DIVS_CD
    revoked_date: Mapped[Optional[str]] = mapped_column(default=None)  # RTRCN_DSCTN_DT
    nation: Mapped[Optional[str]] = mapped_column(default=None)        # MNSC_NATN_CD 제조국
    industry: Mapped[Optional[str]] = mapped_column(default=None)      # INDT_NM 제조업/수입업


class MfdsPermit(Base, TimestampMixin):
    """식약처 의료기기 품목허가 1건(허가 업체명 포함). 고유키는 품목일련번호(MDEQ_PRDLST_SN).

    mfds_device_items(MdeqPrdlstInfoService02)에는 **허가 업체명이 없다** — 국내 제조품은
    제조원(MNSC_NM) 칸이 비어 제조사를 알 수 없었다. 이 표는 다른 API(15057456)에서 받는다:
      entrps   ENTRPS   허가·신고 업체. 국내 제조 허가(제허·제인·제신…)는 곧 제조사, 수입 허가는 수입사.
      manuf_nm MANUF_NM 제조원(수입품의 해외 제조사).
    같은 품목일련번호 체계지만 출처·갱신 주기가 달라 표를 나눴다(둘 중 하나만 다시 받아도 된다).

    원천: https://apis.data.go.kr/1471000/MdlpPrdlstPrmisnInfoService06/getMdlpPrdlstPrmisnList05
    적재: backend/scripts/sync_mfds_permits.py
    사용: backend/scripts/apply_brand.py (허가번호 → 표시용 제조사)
    """

    __tablename__ = "mfds_permits"
    __table_args__ = (Index("idx_mfds_permit_license", "license_no"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    item_sn: Mapped[str] = mapped_column(unique=True)                     # MDEQ_PRDLST_SN
    license_no: Mapped[Optional[str]] = mapped_column(default=None)       # PRDUCT_PRMISN_NO 정규화본
    entrps: Mapped[Optional[str]] = mapped_column(default=None)           # ENTRPS 허가 업체
    manuf_nm: Mapped[Optional[str]] = mapped_column(default=None)         # MANUF_NM 제조원
    client_name: Mapped[Optional[str]] = mapped_column(default=None)      # MNFT_CLNT_NM 제조 의뢰자
    product: Mapped[Optional[str]] = mapped_column(default=None)          # PRDUCT 품목명
    permit_date: Mapped[Optional[str]] = mapped_column(default=None)      # PRMISN_DT
    revoked_code: Mapped[Optional[str]] = mapped_column(default=None)     # RTRCN_DSCTN_DIVS_CD
    changed_date: Mapped[Optional[str]] = mapped_column(default=None)     # CHG_DT
