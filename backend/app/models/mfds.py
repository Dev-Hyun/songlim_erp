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
