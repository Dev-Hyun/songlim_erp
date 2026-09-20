"""행정안전부 지방행정 인허가(개설·등록) 데이터 — 의료기관 개설 현황용.

심평원 병원정보서비스에는 폐업·휴업 데이터가 없어서 개설 현황 화면이 '신규 개설'만
반쪽으로 보여줬다. 행안부 LOCALDATA는 인허가일·영업상태·폐업일·휴업일을 모두 주므로
개설 현황은 전부 이 테이블에서 집계한다 (hospitals 테이블과는 별개 — 조인하지 않는다).

원천: https://apis.data.go.kr/1741000/clinics/info (의원·치과의원·한의원 125,723건)
      https://apis.data.go.kr/1741000/hospitals/info (병원 — 활용신청 승인 대기 중)
적재: backend/scripts/sync_localdata_clinics.py
"""

from typing import Optional

from sqlalchemy import Index
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class LocaldataClinic(Base, TimestampMixin):
    """LOCALDATA 인허가 원장 1행 = 의료기관 1곳. 고유키는 관리번호(MNG_NO)."""

    __tablename__ = "localdata_clinics"

    id: Mapped[int] = mapped_column(primary_key=True)
    mng_no: Mapped[str] = mapped_column(unique=True)  # MNG_NO 관리번호

    # 'clinics'(의원·치과의원·한의원) / 'hospitals'(병원급 — 키가 열리면 같은 테이블에 적재)
    category: Mapped[str] = mapped_column(default="clinics")

    name: Mapped[str] = mapped_column()                                    # BPLC_NM 사업장명
    biz_type: Mapped[Optional[str]] = mapped_column(default=None)          # BZSTAT_SE_NM 의원/한의원/치과의원

    opened_date: Mapped[Optional[str]] = mapped_column(default=None)       # LCPMT_YMD 인허가일자 = 개설일
    closed_date: Mapped[Optional[str]] = mapped_column(default=None)       # CLSBIZ_YMD 폐업일자
    revoked_date: Mapped[Optional[str]] = mapped_column(default=None)      # LCPMT_RTRCN_YMD 인허가취소일자
    suspend_start: Mapped[Optional[str]] = mapped_column(default=None)     # TCBIZ_BGNG_YMD 휴업 시작일
    suspend_end: Mapped[Optional[str]] = mapped_column(default=None)       # TCBIZ_END_YMD 휴업 종료일

    status: Mapped[Optional[str]] = mapped_column(default=None)            # SALS_STTS_NM '영업/정상' 등 원문
    status_code: Mapped[Optional[str]] = mapped_column(default=None)       # SALS_STTS_CD
    # 원문 상태를 화면 필터 4종으로 접은 값: open / suspended / closed / revoked
    status_group: Mapped[Optional[str]] = mapped_column(default=None)
    detail_status: Mapped[Optional[str]] = mapped_column(default=None)     # DTL_SALS_STTS_NM '영업중' 등
    detail_status_code: Mapped[Optional[str]] = mapped_column(default=None)

    road_addr: Mapped[Optional[str]] = mapped_column(default=None)         # ROAD_NM_ADDR 도로명주소
    lot_addr: Mapped[Optional[str]] = mapped_column(default=None)          # LOTNO_ADDR 지번주소
    # 주소에서 파싱 — hospitals.sido/sigungu 표기 관례를 따른다(광주는 전라남도 '광주○구')
    sido: Mapped[Optional[str]] = mapped_column(default=None)
    sigungu: Mapped[Optional[str]] = mapped_column(default=None)

    subjects: Mapped[Optional[str]] = mapped_column(default=None)          # MDEXM_SBJCT_CN_NM 등록 진료과목 원문
    # 기관명(간판)에서 규칙 기반으로 뽑은 대표 진료과. 등록 진료과목과 다를 수 있다.
    dept: Mapped[Optional[str]] = mapped_column(default=None)

    tel: Mapped[Optional[str]] = mapped_column(default=None)               # TELNO
    # CRD_INFO_X/Y — TM 계열 좌표(WGS84 아님). 변환 전이라 지도에는 쓰지 않는다.
    coord_x: Mapped[Optional[float]] = mapped_column(default=None)
    coord_y: Mapped[Optional[float]] = mapped_column(default=None)

    data_updated_at: Mapped[Optional[str]] = mapped_column(default=None)   # DAT_UPDT_PNT 기준일 표기용

    __table_args__ = (
        # 개설 추이·최근 N일 집계 (opened_date 범위 + 상태/지역 필터를 한 인덱스에서 끝낸다)
        Index("idx_ld_cat_opened", "category", "opened_date"),
        Index("idx_ld_status_opened", "status_group", "opened_date"),
        Index("idx_ld_sido_sigungu_opened", "sido", "sigungu", "opened_date"),
        Index("idx_ld_dept_opened", "dept", "opened_date"),
        # 아래 막대(폐업/휴업)는 개설일이 아니라 폐업일·휴업시작일로 집계한다
        Index("idx_ld_closed", "closed_date"),
        Index("idx_ld_suspend", "suspend_start"),
    )
