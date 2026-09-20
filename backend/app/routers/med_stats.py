"""의료기관 데이터 조회 (장비 검색 / 개설 현황 / 분포 현황).

equipment 976K행 · hospitals 64K행이므로 모든 집계는 SQL GROUP BY로 서버에서 끝내고,
목록은 반드시 페이지네이션한다. 원시 행을 프론트로 내려보내지 않는다.

장비 분류는 심평원 전체 장비군(195 대분류)이라 하드코딩하지 않고 DB에서 읽는다
(equipment.category / category_name — scripts/import_hira_equipment_full.py 참고).
"""

import re
import time
from datetime import date, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Select, and_, case, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Equipment, Hospital, LocaldataClinic, User
from app.routers.auth import require_staff

router = APIRouter(prefix="/api/med", tags=["med_stats"])

# 레거시 6종만 짧은 화면 이름을 유지한다 (category_name의 심평원 원본명은 길어서 칩/표에 안 맞는다).
LEGACY_LABEL = {
    "us": "초음파",
    "xray": "X-ray",
    "ct": "CT",
    "mri": "MRI",
    "bmd": "골밀도",
    "carm": "C-arm",
}

# 분류 목록은 임포트할 때만 바뀌는 사실상 정적인 값인데 GROUP BY 한 번이 ~160ms라
# (976K행 인덱스 스캔) 요청마다 돌리면 아깝다. 프로세스 안에서 짧게 캐시한다.
_CATEGORY_TTL = 600.0
_categories_cache: list[tuple[str, str, int]] = []
_categories_at = 0.0


async def _categories(db: AsyncSession) -> list[tuple[str, str, int]]:
    """[(category, label, 보유 행수)] — 행수 많은 순, 단 레거시 6종을 앞에 고정한다."""
    global _categories_cache, _categories_at
    if _categories_cache and time.monotonic() - _categories_at < _CATEGORY_TTL:
        return _categories_cache
    rows = (
        await db.execute(
            select(Equipment.category, func.max(Equipment.category_name), func.count())
            .group_by(Equipment.category)
        )
    ).all()
    legacy = list(LEGACY_LABEL)
    out = [(c, LEGACY_LABEL.get(c) or n or c, k) for c, n, k in rows]
    out.sort(key=lambda r: (legacy.index(r[0]) if r[0] in LEGACY_LABEL else len(legacy), -r[2]))
    _categories_cache, _categories_at = out, time.monotonic()
    return out


async def _category_labels(db: AsyncSession) -> dict[str, str]:
    return {c: label for c, label, _ in await _categories(db)}


async def _check_category(db: AsyncSession, category: Optional[str]) -> None:
    if category and category not in await _category_labels(db):
        raise HTTPException(400, "알 수 없는 장비 분류입니다")


# 종별 그룹 — stats.py의 _type_filter와 같은 규칙을 쓰되 한방/치과/기타를 추가로 구분한다.
TYPE_GROUPS = {
    "clinic": lambda: and_(Hospital.type.like("%의원%"), ~Hospital.type.like("%치과%"), ~Hospital.type.like("%한%")),
    # 동물병원(5,457곳)은 의료장비 영업 대상이 아니므로 '병원'에 섞지 않고 별도 그룹으로 둔다
    "hospital": lambda: and_(
        Hospital.type.like("%병원%"),
        ~Hospital.type.like("%종합%"),
        ~Hospital.type.like("%치과%"),
        ~Hospital.type.like("%한방%"),
        ~Hospital.type.like("%요양%"),
        ~Hospital.type.like("%동물%"),
    ),
    "general": lambda: or_(Hospital.type.like("%종합%"), Hospital.type.like("%상급%")),
    "nursing": lambda: Hospital.type.like("%요양병원%"),
    "dental": lambda: Hospital.type.like("%치과%"),
    "oriental": lambda: or_(Hospital.type.like("%한의원%"), Hospital.type.like("%한방%")),
    "animal": lambda: Hospital.type.like("%동물%"),
}


def _apply_hospital_filters(
    q: Select,
    sido: Optional[str],
    sigungu: Optional[str],
    type_group: Optional[str],
    hosp_type: Optional[str],
) -> Select:
    if sido:
        q = q.where(Hospital.sido == sido)
    if sigungu:
        q = q.where(Hospital.sigungu == sigungu)
    if hosp_type:
        q = q.where(Hospital.type == hosp_type)
    if type_group:
        f = TYPE_GROUPS.get(type_group)
        if f is None:
            raise HTTPException(400, "알 수 없는 종별 그룹입니다")
        q = q.where(f())
    return q


async def _latest_year(db: AsyncSession) -> int:
    """스냅샷 기준 최신 연도. 수기 등록(source='manual')은 임의 연도가 들어올 수 있으므로
    심평원 일괄 import 연도만 본다 (예: 2026년 수기 1건 때문에 최신 연도가 2026이 되는 것 방지)."""
    return (
        await db.execute(select(func.max(Equipment.year)).where(Equipment.source == "import"))
    ).scalar_one()


def _apply_equipment_filters(
    q: Select,
    category: Optional[str],
    year: Optional[int],
    manufacturer: Optional[str],
    model: Optional[str],
) -> Select:
    if category:
        # 분류 유효성은 호출부에서 _check_category로 확인한다 (DB 조회가 필요해 async라서)
        q = q.where(Equipment.category == category)
    if year:
        q = q.where(Equipment.year == year)
    if manufacturer:
        q = q.where(Equipment.manufacturer == manufacturer)
    if model:
        q = q.where(Equipment.model.ilike(f"%{model}%"))
    return q


# ────────────────────────────────────────────────────────
# 공통 메타 (필터 옵션)
# ────────────────────────────────────────────────────────
@router.get("/meta")
async def meta(db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    """카테고리 / 연도 / 시도 / 종별 목록 — 필터 드롭다운 채우기용."""
    years = (
        await db.execute(
            select(Equipment.year)
            .where(Equipment.source == "import")
            .distinct()
            .order_by(Equipment.year.desc())
        )
    ).scalars().all()
    sidos = (
        await db.execute(select(Hospital.sido).where(Hospital.sido.is_not(None)).distinct().order_by(Hospital.sido))
    ).scalars().all()
    types = (
        await db.execute(
            select(Hospital.type, func.count())
            .where(Hospital.type.is_not(None))
            .group_by(Hospital.type)
            .order_by(func.count().desc())
        )
    ).all()
    return {
        "categories": [{"value": c, "label": label, "rows": n} for c, label, n in await _categories(db)],
        "years": years,
        "sidos": sidos,
        "types": [{"value": t, "label": t, "count": n} for t, n in types],
        "type_groups": [
            {"value": "clinic", "label": "의원"},
            {"value": "hospital", "label": "병원"},
            {"value": "general", "label": "종합/상급종합"},
            {"value": "nursing", "label": "요양병원"},
            {"value": "dental", "label": "치과"},
            {"value": "oriental", "label": "한의원/한방병원"},
            {"value": "animal", "label": "동물병원"},
        ],
    }


@router.get("/regions/sigungu")
async def sigungu_list(
    sido: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
):
    rows = (
        await db.execute(
            select(Hospital.sigungu)
            .where(Hospital.sido == sido, Hospital.sigungu.is_not(None))
            .distinct()
            .order_by(Hospital.sigungu)
        )
    ).scalars().all()
    return rows


# ────────────────────────────────────────────────────────
# 1. 의료기관 장비 검색
# ────────────────────────────────────────────────────────
@router.get("/equipment/manufacturers")
async def equipment_manufacturers(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: Optional[str] = None,
    year: Optional[int] = None,
):
    """제조사 목록 + 보유 기관 수 — 서버 집계.

    심평원 '의료장비 상세 현황' 원본에는 제조사 컬럼이 없어서, 2025 스냅샷으로 새로 들어온
    분류(source='hira_2025')는 제조사가 비어 있고 빈 목록이 나온다."""
    await _check_category(db, category)
    q = select(
        Equipment.manufacturer,
        func.count(func.distinct(Equipment.hospital_id)).label("hospitals"),
        func.sum(Equipment.eq_count).label("units"),
    ).where(Equipment.manufacturer.is_not(None))
    q = _apply_equipment_filters(q, category, year, None, None)
    q = q.group_by(Equipment.manufacturer).order_by(func.sum(Equipment.eq_count).desc())
    return [{"manufacturer": m, "hospitals": h, "units": u or 0} for m, h, u in (await db.execute(q)).all()]


@router.get("/equipment/models")
async def equipment_models(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: Optional[str] = None,
    year: Optional[int] = None,
    manufacturer: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(100, le=500),
):
    """모델 목록 + 보유 기관 수/대수 — 모델 브라우즈 및 자동완성용."""
    await _check_category(db, category)
    stmt = select(
        Equipment.model,
        Equipment.manufacturer,
        Equipment.category,
        func.count(func.distinct(Equipment.hospital_id)).label("hospitals"),
        func.sum(Equipment.eq_count).label("units"),
    ).where(Equipment.model.is_not(None))
    stmt = _apply_equipment_filters(stmt, category, year, manufacturer, None)
    if q:
        stmt = stmt.where(Equipment.model.ilike(f"%{q}%"))
    stmt = (
        stmt.group_by(Equipment.model, Equipment.manufacturer, Equipment.category)
        .order_by(func.sum(Equipment.eq_count).desc())
        .limit(limit)
    )
    return [
        {"model": m, "manufacturer": mf, "category": c, "hospitals": h, "units": u or 0}
        for m, mf, c, h, u in (await db.execute(stmt)).all()
    ]


@router.get("/equipment/by-category")
async def equipment_by_category(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    year: Optional[int] = None,
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
    type_group: Optional[str] = None,
):
    """분류별 보유 기관 수 / 총 대수 — 분류 브라우즈 카드. 대수 많은 순으로 내려준다.

    지역/종별 필터가 없으면 hospitals 조인을 아예 걸지 않는다. equipment.hospital_id는 NOT NULL
    FK라 조인해도 행이 줄지 않는데, 2025년 행이 70만이라 조인만으로 실측 207ms -> 745ms가 된다.
    """
    q = select(
        Equipment.category,
        func.count(func.distinct(Equipment.hospital_id)).label("hospitals"),
        func.sum(Equipment.eq_count).label("units"),
        func.count(func.distinct(Equipment.model)).label("models"),
    )
    if sido or sigungu or type_group:
        q = q.join(Hospital, Hospital.id == Equipment.hospital_id)
        q = _apply_hospital_filters(q, sido, sigungu, type_group, None)
    q = _apply_equipment_filters(q, None, year, None, None).group_by(Equipment.category)

    labels = await _category_labels(db)
    rows = [
        {"category": c, "label": labels.get(c, c), "hospitals": h, "units": u or 0, "models": m}
        for c, h, u, m in (await db.execute(q)).all()
    ]
    rows.sort(key=lambda r: (-r["units"], r["label"]))
    return rows


@router.get("/equipment/search")
async def equipment_search(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    year: int = 2025,
    category: Optional[str] = None,
    manufacturer: Optional[str] = None,
    model: Optional[str] = None,
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
    type_group: Optional[str] = None,
    hospital_q: Optional[str] = None,
    sort: str = "units",
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
):
    """장비 조건 → 보유 의료기관 목록. 병원명만 넣으면 그 병원의 보유 장비 전체가 나온다.

    hospitals×equipment 조인을 GROUP BY hospital_id로 집계한 뒤 LIMIT/OFFSET 페이지네이션하고,
    장비 상세는 현재 페이지의 병원 id에 대해서만 다시 조회한다.
    """
    await _check_category(db, category)
    has_eq_filter = bool(category or manufacturer or model)

    if not has_eq_filter and not hospital_q and not sido:
        raise HTTPException(400, "장비 조건(분류/제조사/모델) 또는 병원명 또는 시도 중 하나는 지정해야 합니다")

    base = select(Equipment.hospital_id).join(Hospital, Hospital.id == Equipment.hospital_id)
    base = _apply_equipment_filters(base, category, year, manufacturer, model)
    base = _apply_hospital_filters(base, sido, sigungu, type_group, None)
    if hospital_q:
        base = base.where(Hospital.name.ilike(f"%{hospital_q}%"))

    agg = base.add_columns(
        func.sum(Equipment.eq_count).label("units"),
        func.count(Equipment.id).label("lines"),
    ).group_by(Equipment.hospital_id)

    total = (await db.execute(select(func.count()).select_from(agg.subquery()))).scalar_one()
    total_units = (
        await db.execute(base.with_only_columns(func.coalesce(func.sum(Equipment.eq_count), 0)))
    ).scalar_one()

    order = {
        "units": func.sum(Equipment.eq_count).desc(),
        "name": func.min(Hospital.name).asc(),
        "region": func.min(Hospital.sido).asc(),
    }.get(sort, func.sum(Equipment.eq_count).desc())
    agg = agg.order_by(order, Equipment.hospital_id.asc()).limit(page_size).offset((page - 1) * page_size)
    page_rows = (await db.execute(agg)).all()
    hosp_ids = [r[0] for r in page_rows]
    if not hosp_ids:
        return {"total": 0, "total_units": 0, "page": page, "page_size": page_size, "items": []}

    hospitals = {
        h.id: h for h in (await db.execute(select(Hospital).where(Hospital.id.in_(hosp_ids)))).scalars().all()
    }

    # 현재 페이지 병원들의 해당 연도 장비 전체 (분류 필터가 있어도 병원 카드에는 전체를 보여준다)
    det = (
        await db.execute(
            select(
                Equipment.hospital_id,
                Equipment.category,
                Equipment.manufacturer,
                Equipment.model,
                func.sum(Equipment.eq_count),
            )
            .where(Equipment.hospital_id.in_(hosp_ids), Equipment.year == year)
            .group_by(Equipment.hospital_id, Equipment.category, Equipment.manufacturer, Equipment.model)
        )
    ).all()
    labels = await _category_labels(db)
    by_hosp: dict[int, list] = {i: [] for i in hosp_ids}
    for hid, cat, mf, md, cnt in det:
        by_hosp[hid].append(
            {"category": cat, "label": labels.get(cat, cat), "manufacturer": mf, "model": md, "count": cnt or 0}
        )
    for items in by_hosp.values():
        items.sort(key=lambda e: (-e["count"], e["category"], e["model"] or ""))

    def matched(e: dict) -> bool:
        if category and e["category"] != category:
            return False
        if manufacturer and e["manufacturer"] != manufacturer:
            return False
        if model and model.lower() not in (e["model"] or "").lower():
            return False
        return True

    items = []
    for hid, units, lines in page_rows:
        h = hospitals.get(hid)
        if h is None:
            continue
        eqs = by_hosp.get(hid, [])
        items.append(
            {
                "hospital_id": hid,
                "name": h.name,
                "type": h.type,
                "sido": h.sido,
                "sigungu": h.sigungu,
                "address": h.address,
                "lat": h.lat,
                "lng": h.lng,
                "is_member": h.hospital_profile_id is not None,
                "matched_units": units or 0,
                "matched_lines": lines,
                "equipment": eqs,
                "matched_equipment": [e for e in eqs if matched(e)] if has_eq_filter else eqs,
            }
        )
    return {"total": total, "total_units": total_units or 0, "page": page, "page_size": page_size, "items": items}


@router.get("/hospital/{hospital_id}/equipment")
async def hospital_equipment(
    hospital_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
):
    """한 의료기관의 연도별 보유 장비 전체 (모든 분류)."""
    h = (await db.execute(select(Hospital).where(Hospital.id == hospital_id))).scalar_one_or_none()
    if h is None:
        raise HTTPException(404, "의료기관을 찾을 수 없습니다")
    rows = (
        await db.execute(
            select(
                Equipment.year,
                Equipment.category,
                Equipment.manufacturer,
                Equipment.model,
                func.sum(Equipment.eq_count),
            )
            .where(Equipment.hospital_id == hospital_id)
            .group_by(Equipment.year, Equipment.category, Equipment.manufacturer, Equipment.model)
            .order_by(Equipment.year.desc(), Equipment.category)
        )
    ).all()
    labels = await _category_labels(db)
    return {
        "hospital": {
            "id": h.id,
            "name": h.name,
            "type": h.type,
            "sido": h.sido,
            "sigungu": h.sigungu,
            "address": h.address,
            "lat": h.lat,
            "lng": h.lng,
        },
        "equipment": [
            {
                "year": y,
                "category": c,
                "label": labels.get(c, c),
                "manufacturer": mf,
                "model": md,
                "count": n or 0,
            }
            for y, c, mf, md, n in rows
        ],
    }


# ────────────────────────────────────────────────────────
# 2. 의료기관 개설 현황 — 행정안전부 지방행정 인허가(개설·등록) 데이터
#
# 전부 localdata_clinics에서 집계한다 (hospitals 테이블과 조인하지 않는다).
# 심평원 estb_date는 신고 지연이 커서 최근 구간이 과소 집계됐지만, 인허가 원장은
# 인허가일·영업상태·폐업일·휴업시작일을 모두 갖고 있어 개설·폐업·휴업을 한 화면에서 센다.
#
# ★ 기준일(as_of)은 "오늘"이 아니라 데이터 기준일 MAX(data_updated_at)이다.
#   적재가 하루 밀리면 오늘 기준 창은 마지막 하루가 통째로 비어 "최근 30일"이 급감한 것처럼
#   보인다. 모든 기간 창은 [as_of-(N-1), as_of] 폐구간으로 잡는다.
# ────────────────────────────────────────────────────────
LD = LocaldataClinic

# 수도권 = 서울·경기·인천 (메디하루 정의 그대로)
METRO_SIDOS = ("서울특별시", "경기도", "인천광역시")

# 주소 파싱이 실패해 동 이름이 sido로 들어간 행이 2천여 건 남아 있다(전부 최근 1년 밖).
# 지역 축·드롭다운은 표준 시도명만 노출해 그 잡음이 화면에 새지 않게 한다.
SIDO_CANON = (
    "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시",
    "울산광역시", "세종특별자치시", "경기도", "강원특별자치도", "충청북도", "충청남도",
    "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
)

# 화면 라벨 → (DB status_group 원문, 조회 기준 날짜 컬럼, 날짜 라벨).
# '전체' 옵션은 두지 않는다. 우리 원문 '취소/말소/만료/정지/중지'를 메디하루 라벨로 접는다.
# 휴·폐업은 개설일이 아니라 폐업일·휴업시작일로 조회한다(메디하루 동작과 동일).
OPENING_STATUSES: dict[str, tuple[str, Any, str]] = {
    "영업/정상": ("영업/정상", LocaldataClinic.opened_date, "개설일"),
    "휴업": ("휴업", LocaldataClinic.suspend_start, "휴업 시작일"),
    "폐업": ("폐업", LocaldataClinic.closed_date, "폐업일"),
    # 취소·말소 건은 revoked_date가 비어 있고 폐업일 컬럼에 날짜가 들어온다(494건 전수 확인).
    "취소/말소/정지": ("취소/말소/만료/정지/중지", LocaldataClinic.closed_date, "취소·말소일"),
}

OPENING_PERIODS = [
    (7, "최근 7일"), (30, "최근 30일"), (90, "최근 90일"), (365, "최근 1년"),
    (1095, "최근 3년"), (1825, "최근 5년"), (0, "전체"),
]
OPENING_DAYS = {d for d, _ in OPENING_PERIODS}

OPENING_CATEGORIES = [("clinics", "신규 의원"), ("hospitals", "신규 병원")]

OPENING_SOURCE = "행정안전부 지방행정 인허가(개설·등록) 데이터"

# 진료과 비교·히트맵은 의원급만 본다(메디하루 FAQ 3번). 치과의원·한의원을 섞으면
# 치과·한방내과가 구성비를 다 먹어서 권역 차이가 보이지 않는다.
CLINIC_BIZ_TYPE = "의원"

# sigungu에도 같은 파싱 잡음이 남아 있다(지번 번지·도로명이 시군구 자리에 들어간 행 1,433건).
# '○○시/군/구' 꼴만 드롭다운에 올린다 — '택지개발지구' 같은 구역명은 한 번 더 걷어낸다.
_SIGUNGU_OK = re.compile(r"^[가-힣]{1,11}[시군구]$")

# as_of는 하루 한 번 바뀌는 값인데 data_updated_at에 인덱스가 없어 MAX()가 전수 스캔이다.
_ASOF_TTL = 600.0
_asof_cache: Optional[tuple[date, str]] = None
_asof_at = 0.0


async def _openings_as_of(db: AsyncSession) -> tuple[date, str]:
    """(기준일, 원문 data_updated_at). 데이터가 비면 오늘로 떨어진다."""
    global _asof_cache, _asof_at
    if _asof_cache and time.monotonic() - _asof_at < _ASOF_TTL:
        return _asof_cache
    raw = (await db.execute(select(func.max(LD.data_updated_at)))).scalar_one()
    day: Optional[date] = None
    if raw:
        try:
            day = date.fromisoformat(str(raw)[:10])
        except ValueError:
            day = None
    if day is None:
        latest = (await db.execute(select(func.max(LD.opened_date)))).scalar_one()
        try:
            day = date.fromisoformat(latest) if latest else date.today()
        except ValueError:
            day = date.today()
    _asof_cache = (day, str(raw) if raw else day.isoformat())
    _asof_at = time.monotonic()
    return _asof_cache


def _win(as_of: date, days: int) -> tuple[Optional[str], str]:
    """기간 프리셋 → [시작일, 기준일] 폐구간. days=0(전체)이면 시작일 없음."""
    if days <= 0:
        return None, as_of.isoformat()
    return (as_of - timedelta(days=days - 1)).isoformat(), as_of.isoformat()


def _in_win(col, start: Optional[str], end: str):
    """YYYY-MM-DD 문자열이라 사전순 비교 = 날짜순 비교."""
    conds = [col.is_not(None), col <= end]
    if start:
        conds.append(col >= start)
    return and_(*conds)


def _check_days(days: int) -> int:
    if days not in OPENING_DAYS:
        raise HTTPException(400, "알 수 없는 조회 기간입니다")
    return days


def _check_tab(category: str) -> str:
    if category not in {c for c, _ in OPENING_CATEGORIES}:
        raise HTTPException(400, "알 수 없는 탭입니다")
    return category


async def _has_tab_rows(db: AsyncSession, category: str) -> bool:
    return bool(
        (
            await db.execute(select(func.count()).select_from(LD).where(LD.category == category))
        ).scalar_one()
    )


async def _opened_count(db: AsyncSession, category: str, start: Optional[str], end: str) -> int:
    return (
        await db.execute(
            select(func.count())
            .select_from(LD)
            .where(LD.category == category, _in_win(LD.opened_date, start, end))
        )
    ).scalar_one()


def _months_back(anchor: date, n: int) -> list[str]:
    """anchor가 속한 달을 마지막으로 하는 최근 n개월 키(YYYY-MM)."""
    y, m = anchor.year, anchor.month
    out: list[str] = []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    return list(reversed(out))


def _tab_pending(category: str, as_of: date, raw: str) -> dict:
    """병원급 인허가 API는 활용신청 승인 전이라 아직 한 건도 없다 — 화면은 '준비 중'을 그린다."""
    return {
        "available": False,
        "category": category,
        "as_of": as_of.isoformat(),
        "data_updated_at": raw,
        "message": "병원급 인허가 데이터는 준비 중입니다",
    }


# ── 2-0. 필터 옵션 + 기준일 ──────────────────────────────
@router.get("/openings/meta")
async def openings_meta(db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    """탭·기간·시도/시군구·상태 드롭다운 + 출처 배지에 쓸 기준일."""
    as_of, raw = await _openings_as_of(db)
    pairs = (
        await db.execute(
            select(LD.sido, LD.sigungu).where(LD.sido.in_(SIDO_CANON)).distinct()
        )
    ).all()
    # 세종시처럼 시군구가 없는 곳도 있으므로 시도 목록과 시군구 목록은 따로 모은다.
    present: set[str] = set()
    grouped: dict[str, list[str]] = {}
    for sido, sigungu in pairs:
        present.add(sido)
        if sigungu and _SIGUNGU_OK.match(sigungu) and not sigungu.endswith("지구"):
            grouped.setdefault(sido, []).append(sigungu)

    tabs = []
    for value, label in OPENING_CATEGORIES:
        tabs.append({"value": value, "label": label, "available": await _has_tab_rows(db, value)})

    return {
        "as_of": as_of.isoformat(),
        "data_updated_at": raw,
        "source": OPENING_SOURCE,
        "categories": tabs,
        "periods": [{"value": d, "label": label} for d, label in OPENING_PERIODS],
        "statuses": [{"value": k, "date_label": v[2]} for k, v in OPENING_STATUSES.items()],
        "sidos": [
            {"value": s, "sigungus": sorted(grouped.get(s, []))}
            for s in SIDO_CANON
            if s in present
        ],
    }


# ── 2-1. 핵심 요약 + 수도권 도넛(차트②) + 규칙 기반 문장 ──
@router.get("/openings/summary")
async def openings_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: str = "clinics",
):
    """최근 30일 신규 / 30일 환산 평균 대비 / 수도권 비중 / 개설 증가폭 최대 지역.

    목록 필터의 조회 기간과 무관하게 항상 30·90일 고정 창으로 센다(메디하루와 동일).
    """
    _check_tab(category)
    as_of, raw = await _openings_as_of(db)
    if not await _has_tab_rows(db, category):
        return _tab_pending(category, as_of, raw)

    s30, end = _win(as_of, 30)
    s90, _ = _win(as_of, 90)
    prev_end = (as_of - timedelta(days=30)).isoformat()
    prev_start = (as_of - timedelta(days=59)).isoformat()

    recent30 = await _opened_count(db, category, s30, end)
    recent90 = await _opened_count(db, category, s90, end)
    prev30 = await _opened_count(db, category, prev_start, prev_end)
    # 30일 환산 평균 = 최근 90일 ÷ 90 × 30
    baseline = round(recent90 / 3)

    metro = (
        await db.execute(
            select(func.count())
            .select_from(LD)
            .where(
                LD.category == category,
                _in_win(LD.opened_date, s30, end),
                LD.sido.in_(METRO_SIDOS),
            )
        )
    ).scalar_one()
    metro_share = round(metro / recent30 * 100, 1) if recent30 else 0.0

    # 개설 증가폭 최대 지역 — 시군구 단위로 최근 30일과 직전 30일을 한 번에 센다.
    movers = (
        await db.execute(
            select(
                LD.sido,
                LD.sigungu,
                func.sum(case((_in_win(LD.opened_date, s30, end), 1), else_=0)),
                func.sum(case((_in_win(LD.opened_date, prev_start, prev_end), 1), else_=0)),
            )
            .where(
                LD.category == category,
                LD.sido.in_(SIDO_CANON),
                LD.sigungu.is_not(None),
                _in_win(LD.opened_date, prev_start, end),
            )
            .group_by(LD.sido, LD.sigungu)
        )
    ).all()
    # 1~2건짜리 잡음을 지역 시그널로 부풀리지 않도록 최소 표본 임계를 건다(메디하루 FAQ 4번).
    ranked = sorted(
        (
            {"sido": s, "sigungu": g, "recent": int(a), "prev": int(b), "delta": int(a) - int(b)}
            for s, g, a, b in movers
            if int(a) >= 3 and int(a) - int(b) >= 2
        ),
        key=lambda r: (-r["delta"], -r["recent"]),
    )
    top_region = ranked[0] if ranked else None

    # 12개월 폐업·취소·휴업 — 개설 시기와 관계없이 그 달에 발생한 건을 센다.
    months = _months_back(as_of, 12)
    y12_start = f"{months[0]}-01"
    closed_rows = dict(
        (
            await db.execute(
                select(LD.status_group, func.count())
                .where(
                    LD.category == category,
                    _in_win(LD.closed_date, y12_start, end),
                    LD.status_group.in_(["폐업", "취소/말소/만료/정지/중지"]),
                )
                .group_by(LD.status_group)
            )
        ).all()
    )
    suspended12 = (
        await db.execute(
            select(func.count())
            .select_from(LD)
            .where(LD.category == category, _in_win(LD.suspend_start, y12_start, end))
        )
    ).scalar_one()
    closed12 = int(closed_rows.get("폐업", 0))
    revoked12 = int(closed_rows.get("취소/말소/만료/정지/중지", 0))

    gap = recent30 - baseline
    gap_word = "많았습니다" if gap > 0 else ("적었습니다" if gap < 0 else "같았습니다")
    insights = [
        f"최근 30일 신규 개설은 {recent30:,}건으로, 최근 90일의 30일 환산 평균"
        f"(약 {baseline:,}건)보다 {abs(gap):,}건 {gap_word}.",
        f"최근 30일 신규 개설 {recent30:,}건 중 {metro:,}건이 수도권에서 발생했습니다.",
        f"최근 12개월 동안 폐업한 기관은 {closed12:,}건(취소·말소·정지 {revoked12:,}건 별도), "
        f"휴업을 시작한 기관은 {suspended12:,}건입니다.",
    ]

    return {
        "available": True,
        "category": category,
        "as_of": as_of.isoformat(),
        "data_updated_at": raw,
        "recent30": {"start": s30, "end": end, "count": recent30},
        "recent90": {"start": s90, "end": end, "count": recent90},
        "prev30": {"start": prev_start, "end": prev_end, "count": prev30},
        "baseline30": baseline,
        "gap_vs_baseline": gap,
        "delta_vs_prev30": recent30 - prev30,
        "metro": {
            "count": metro,
            "share": metro_share,
            "non_count": recent30 - metro,
            "non_share": round(100 - metro_share, 1) if recent30 else 0.0,
        },
        "top_region": top_region,
        "last12m": {"closed": closed12, "revoked": revoked12, "suspended": suspended12},
        "insights": insights,
        "metro_summary": (
            f"최근 30일 신규 개설의 {metro_share}%가 수도권(서울·경기·인천)에서 발생했습니다."
            if recent30
            else "최근 30일 신규 개설이 없습니다."
        ),
    }


# ── 2-2. 차트① 개설 추이 (12개월 적층 막대) ──────────────
@router.get("/openings/trend")
async def openings_trend(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: str = "clinics",
):
    """기준선 위 = 인허가일 기준 신규 개설, 아래 = 그 달에 폐업·취소·휴업이 발생한 건.

    폐업·휴업은 '개설 시기와 관계없이' 폐업일·휴업시작일이 그 달인 기관을 센다.
    """
    _check_tab(category)
    as_of, raw = await _openings_as_of(db)
    if not await _has_tab_rows(db, category):
        return _tab_pending(category, as_of, raw)

    months = _months_back(as_of, 12)
    start, end = f"{months[0]}-01", as_of.isoformat()

    async def _by_month(col, extra=None) -> dict[str, int]:
        bucket = func.substr(col, 1, 7)
        q = (
            select(bucket, func.count())
            .where(LD.category == category, _in_win(col, start, end))
            .group_by(bucket)
        )
        if extra is not None:
            q = q.where(extra)
        return {m: int(n) for m, n in (await db.execute(q)).all()}

    opened = await _by_month(LD.opened_date)
    closed = await _by_month(LD.closed_date, LD.status_group == "폐업")
    revoked = await _by_month(LD.closed_date, LD.status_group == "취소/말소/만료/정지/중지")
    suspended = await _by_month(LD.suspend_start)

    current = as_of.strftime("%Y-%m")
    # "최근 3개월 월평균 개설" = 최근 90일을 30일로 환산한 값 (메디하루도 두 수치가 같다)
    s90, _ = _win(as_of, 90)
    avg3 = round(await _opened_count(db, category, s90, end) / 3)

    return {
        "available": True,
        "category": category,
        "as_of": as_of.isoformat(),
        "data_updated_at": raw,
        "current_month": current,
        "avg_recent3": avg3,
        "points": [
            {
                "month": m,
                "opened": opened.get(m, 0),
                "closed": closed.get(m, 0),
                "revoked": revoked.get(m, 0),
                "suspended": suspended.get(m, 0),
                "partial": m == current,
            }
            for m in months
        ],
    }


# ── 2-3. 차트③ 권역 간 진료과 구성비 차이 ────────────────
@router.get("/openings/dept-mix")
async def openings_dept_mix(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: str = "clinics",
    days: int = 90,
    limit: int = Query(8, ge=3, le=20),
):
    """수도권 vs 비수도권의 의원급 신규 개설 진료과 구성비 차이(%p) Top.

    진료과는 등록 진료과목이 아니라 기관명(간판)에서 파생한 값이라 대략적인 구분이다.
    구성비 분모는 진료과가 판별된 의원급 개설 건수다.
    """
    _check_tab(category)
    _check_days(days)
    as_of, raw = await _openings_as_of(db)
    if not await _has_tab_rows(db, category):
        return _tab_pending(category, as_of, raw)

    start, end = _win(as_of, days)
    rows = (
        await db.execute(
            select(
                LD.dept,
                func.sum(case((LD.sido.in_(METRO_SIDOS), 1), else_=0)),
                func.sum(case((LD.sido.in_(METRO_SIDOS), 0), else_=1)),
            )
            .where(
                LD.category == category,
                LD.biz_type == CLINIC_BIZ_TYPE,
                LD.dept.is_not(None),
                _in_win(LD.opened_date, start, end),
            )
            .group_by(LD.dept)
        )
    ).all()

    metro_total = sum(int(m) for _, m, _ in rows)
    non_total = sum(int(n) for _, _, n in rows)
    out = []
    for dept, m, n in rows:
        m, n = int(m), int(n)
        ms = m / metro_total * 100 if metro_total else 0.0
        ns = n / non_total * 100 if non_total else 0.0
        out.append(
            {
                "dept": dept,
                "metro": m,
                "non_metro": n,
                "metro_share": round(ms, 1),
                "non_metro_share": round(ns, 1),
                "diff": round(ms - ns, 1),
            }
        )
    out.sort(key=lambda r: (-abs(r["diff"]), -(r["metro"] + r["non_metro"])))
    top = out[:limit]

    summary = "권역 간 비교에 쓸 의원급 신규 개설이 없습니다."
    if top:
        h = top[0]
        side = "수도권" if h["diff"] >= 0 else "비수도권"
        summary = (
            f"권역 간 의원 진료과 구성비 차이가 가장 큰 진료과는 {h['dept']}로, "
            f"{side}이 {abs(h['diff'])}%p 높습니다."
        )

    return {
        "available": True,
        "category": category,
        "as_of": as_of.isoformat(),
        "data_updated_at": raw,
        "days": days,
        "start": start,
        "end": end,
        "metro_total": metro_total,
        "non_metro_total": non_total,
        "rows": top,
        "summary": summary,
    }


# ── 2-4. 차트④ 지역 × 진료과 개설 분포 (히트맵) ──────────
@router.get("/openings/heatmap")
async def openings_heatmap(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: str = "clinics",
    days: int = 90,
    dept_limit: int = Query(8, ge=3, le=15),
):
    """시도 × 진료과 의원급 개설 건수 격자. 상위 3개 셀은 테두리 강조용으로 따로 내려준다."""
    _check_tab(category)
    _check_days(days)
    as_of, raw = await _openings_as_of(db)
    if not await _has_tab_rows(db, category):
        return _tab_pending(category, as_of, raw)

    start, end = _win(as_of, days)
    rows = (
        await db.execute(
            select(LD.sido, LD.dept, func.count())
            .where(
                LD.category == category,
                LD.biz_type == CLINIC_BIZ_TYPE,
                LD.sido.in_(SIDO_CANON),
                LD.dept.is_not(None),
                _in_win(LD.opened_date, start, end),
            )
            .group_by(LD.sido, LD.dept)
        )
    ).all()

    dept_totals: dict[str, int] = {}
    sido_totals: dict[str, int] = {}
    grid: dict[tuple[str, str], int] = {}
    for sido, dept, n in rows:
        n = int(n)
        grid[(sido, dept)] = n
        dept_totals[dept] = dept_totals.get(dept, 0) + n
        sido_totals[sido] = sido_totals.get(sido, 0) + n

    depts = [d for d, _ in sorted(dept_totals.items(), key=lambda kv: (-kv[1], kv[0]))][:dept_limit]
    sidos = [s for s, _ in sorted(sido_totals.items(), key=lambda kv: (-kv[1], kv[0]))]
    cells = [[grid.get((s, d), 0) for d in depts] for s in sidos]
    flat = [(v, r, c) for r, row in enumerate(cells) for c, v in enumerate(row) if v > 0]
    flat.sort(key=lambda t: -t[0])

    summary = "해당 기간 의원급 개설이 없습니다."
    if depts and sidos:
        lead = depts[0]
        by_lead = [(s, grid.get((s, lead), 0)) for s in sidos]
        by_lead.sort(key=lambda kv: -kv[1])
        names = "·".join(s for s, v in by_lead[:2] if v > 0)
        if names:
            summary = f"최근 {days}일 {lead} 신규 개설은 {names}에 상대적으로 집중되었습니다."

    return {
        "available": True,
        "category": category,
        "as_of": as_of.isoformat(),
        "data_updated_at": raw,
        "days": days,
        "start": start,
        "end": end,
        "sidos": sidos,
        "depts": depts,
        "cells": cells,
        "max": max((v for v, _, _ in flat), default=0),
        "top_cells": [{"row": r, "col": c, "value": v} for v, r, c in flat[:3]],
        "summary": summary,
    }


# ── 2-5. 신규 개설 기관 목록 ─────────────────────────────
@router.get("/openings/new-list")
async def openings_new_list(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: str = "clinics",
    days: int = 90,
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
    status: str = "영업/정상",
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """사업장명 · 도로명주소 · 개설일 · 상태. 정렬은 상태별 기준 날짜 내림차순 고정."""
    _check_tab(category)
    _check_days(days)
    if status not in OPENING_STATUSES:
        raise HTTPException(400, "알 수 없는 상태입니다")
    as_of, raw = await _openings_as_of(db)
    if not await _has_tab_rows(db, category):
        return {
            **_tab_pending(category, as_of, raw),
            "total": 0,
            "page": page,
            "page_size": page_size,
            "items": [],
        }

    group, date_col, date_label = OPENING_STATUSES[status]
    start, end = _win(as_of, days)

    conds = [LD.category == category, LD.status_group == group, _in_win(date_col, start, end)]
    if sido:
        conds.append(LD.sido == sido)
    if sigungu:
        conds.append(LD.sigungu == sigungu)
    if q:
        conds.append(LD.name.ilike(f"%{q}%"))

    total = (await db.execute(select(func.count()).select_from(LD).where(*conds))).scalar_one()
    rows = (
        (
            await db.execute(
                select(LD)
                .where(*conds)
                .order_by(date_col.desc(), LD.name)
                .limit(page_size)
                .offset((page - 1) * page_size)
            )
        )
        .scalars()
        .all()
    )

    return {
        "available": True,
        "category": category,
        "as_of": as_of.isoformat(),
        "data_updated_at": raw,
        "days": days,
        "start": start,
        "end": end,
        "status": status,
        "date_label": date_label,
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": r.id,
                "name": r.name,
                # 도로명주소가 없는 옛 기관(1만여 건)은 지번주소로 대체한다.
                "address": r.road_addr or r.lot_addr,
                "opened_date": r.opened_date,
                "status": status,
                "detail_status": r.detail_status,
                "status_date": (
                    r.opened_date
                    if status == "영업/정상"
                    else (r.suspend_start if status == "휴업" else r.closed_date)
                ),
                "sido": r.sido,
                "sigungu": r.sigungu,
                "biz_type": r.biz_type,
                "dept": r.dept,
            }
            for r in rows
        ],
    }


# ────────────────────────────────────────────────────────
# 3. 의료기관 분포 현황
# ────────────────────────────────────────────────────────
@router.get("/distribution/regions")
async def distribution_regions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    sido: Optional[str] = None,
    type_group: Optional[str] = None,
    category: Optional[str] = None,
    year: Optional[int] = None,
):
    """시도(또는 sido 지정 시 시군구)별 기관 수 · 장비 보유 기관 수 · 총 대수 · 중심 좌표."""
    await _check_category(db, category)
    level_col = Hospital.sigungu if sido else Hospital.sido
    latest = await _latest_year(db)
    year = year or latest

    base = _apply_hospital_filters(
        select(
            level_col.label("region"),
            func.count().label("hospitals"),
            func.avg(Hospital.lat).label("lat"),
            func.avg(Hospital.lng).label("lng"),
        ).where(level_col.is_not(None)),
        sido,
        None,
        type_group,
        None,
    ).group_by(level_col)
    rows = (await db.execute(base)).all()

    # 기관별로 먼저 접어서(장비 조건만 적용) 지역 집계에 넘긴다. equipment를 hospitals와 바로
    # 조인해 GROUP BY 하면 2025년 70만 행이 전부 조인을 타서 실측 612ms -> 228ms 차이가 난다.
    per_hosp = _apply_equipment_filters(
        select(
            Equipment.hospital_id.label("hospital_id"),
            func.sum(Equipment.eq_count).label("units"),
        ).group_by(Equipment.hospital_id),
        category,
        year,
        None,
        None,
    ).subquery()

    eq_q = _apply_hospital_filters(
        select(
            level_col.label("region"),
            func.count().label("eq_hospitals"),
            func.sum(per_hosp.c.units).label("units"),
        )
        .select_from(per_hosp)
        .join(Hospital, Hospital.id == per_hosp.c.hospital_id)
        .where(level_col.is_not(None)),
        sido,
        None,
        type_group,
        None,
    ).group_by(level_col)
    eq_rows = {r: (h, u or 0) for r, h, u in (await db.execute(eq_q)).all()}

    out = []
    for region, hospitals, lat, lng in rows:
        eq_h, units = eq_rows.get(region, (0, 0))
        out.append(
            {
                "region": region,
                "hospitals": hospitals,
                "eq_hospitals": eq_h,
                "eq_share": round(eq_h / hospitals * 100, 1) if hospitals else 0.0,
                "units": units,
                "units_per_100": round(units / hospitals * 100, 1) if hospitals else 0.0,
                "lat": lat,
                "lng": lng,
            }
        )
    out.sort(key=lambda r: -r["hospitals"])
    return {"level": "sigungu" if sido else "sido", "year": year, "rows": out}


@router.get("/distribution/types")
async def distribution_types(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
):
    """종별 기관 수 분포."""
    q = _apply_hospital_filters(
        select(Hospital.type, func.count()).where(Hospital.type.is_not(None)), sido, sigungu, None, None
    ).group_by(Hospital.type).order_by(func.count().desc())
    rows = (await db.execute(q)).all()
    total = sum(n for _, n in rows)
    return {
        "total": total,
        "rows": [{"type": t, "count": n, "share": round(n / total * 100, 1) if total else 0.0} for t, n in rows],
    }


@router.get("/distribution/hospitals")
async def distribution_hospitals(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
    type_group: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
):
    """분포 표에서 지역을 눌렀을 때 보여줄 의료기관 목록 (페이지네이션)."""
    stmt = _apply_hospital_filters(select(Hospital), sido, sigungu, type_group, None)
    if q:
        stmt = stmt.where(Hospital.name.ilike(f"%{q}%"))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (
        await db.execute(stmt.order_by(Hospital.name).limit(page_size).offset((page - 1) * page_size))
    ).scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "hospital_id": h.id,
                "name": h.name,
                "type": h.type,
                "sido": h.sido,
                "sigungu": h.sigungu,
                "address": h.address,
                "lat": h.lat,
                "lng": h.lng,
            }
            for h in rows
        ],
    }


# ────────────────────────────────────────────────────────
# 4. 장비 카탈로그 (클릭 탐색) — /api/med/catalog/*
#
# 텍스트 검색 없이 링크만 눌러서 분류 → 모델 → 보유 의료기관으로 내려가는 탐색용 API.
# 기존 /equipment/* 검색 엔드포인트는 그대로 두고 여기에만 추가한다.
#
# 집계 기준 연도는 _latest_year() (심평원 일괄 import 최신 연도 = 2025) 하나로 고정한다.
# ⚠️ 연도 커버리지가 균일하지 않다: 2019~2024는 레거시 6분류(us/xray/ct/mri/bmd/carm)만 있고
#    나머지 190분류는 2025 스냅샷(source='hira_2025')에만 존재한다. 연도별 추이는 실제로
#    데이터가 있는 연도만 내려주고, 응답에 multi_year 플래그로 그 사실을 알린다.
# ────────────────────────────────────────────────────────

_CATALOG_TTL = 600.0
_catalog_cache: dict[str, tuple[float, Any]] = {}


def _cache_get(key: str) -> Any:
    hit = _catalog_cache.get(key)
    if hit is not None and time.monotonic() - hit[0] < _CATALOG_TTL:
        return hit[1]
    return None


def _cache_put(key: str, value: Any) -> Any:
    _catalog_cache[key] = (time.monotonic(), value)
    return value


async def _catalog_index(db: AsyncSession) -> dict[str, dict]:
    """category -> {code, name}. 196종이고 임포트할 때만 바뀌므로 캐시한다.

    _categories()와 달리 레거시 6종도 심평원 원본 분류명(category_name)을 쓴다 —
    카탈로그는 '초음파'가 아니라 '초음파영상진단기'처럼 원본 명칭으로 보여준다.
    GROUP BY category + bare column은 idx_eq_cat_name만 훑어서 ~130ms (전체 스캔이면 1.6s).
    """
    cached = _cache_get("index")
    if cached is not None:
        return cached
    rows = (
        await db.execute(
            select(Equipment.category, Equipment.category_code, Equipment.category_name).group_by(Equipment.category)
        )
    ).all()
    return _cache_put("index", {c: {"code": code or c, "name": name or c} for c, code, name in rows})


async def _catalog_category(db: AsyncSession, category: str) -> dict:
    info = (await _catalog_index(db)).get(category)
    if info is None:
        raise HTTPException(404, "알 수 없는 장비 분류입니다")
    return {"category": category, "code": info["code"], "name": info["name"]}


# 모델 슬러그: 소문자로 낮추고 영문·숫자·한글만 남긴 뒤 나머지는 하이픈으로 묶는다.
# 한글을 남기므로 URL에서는 퍼센트 인코딩되지만 경로 세그먼트로 안전하다.
_SLUG_DROP = re.compile(r"[^0-9a-z가-힣]+")
_SLUG_MAX = 80


def slugify_model(model: str) -> str:
    s = _SLUG_DROP.sub("-", model.strip().lower()).strip("-")[:_SLUG_MAX].strip("-")
    return s or "model"


async def _category_models(db: AsyncSession, category: str, year: int) -> list[dict]:
    """해당 분류의 모델 전체 [{model, slug, hospitals, units}] — 보유 기관 수 내림차순.

    슬러그는 분류 안에서만 유일하면 되므로(메디하루도 분류 단위로 슬러그를 만든다) 여기서 한 번에
    만든다. 정규화 후 충돌하면(예: 'KENZ ECG-103' / 'KENZ-ECG 103') 보유 기관이 많은 쪽이
    맨 슬러그를 갖고 나머지에 -2, -3… 을 붙인다. 목록·상세가 같은 함수를 쓰므로 항상 일치한다.
    """
    key = f"models:{category}:{year}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    rows = (
        await db.execute(
            select(
                Equipment.model,
                func.count(func.distinct(Equipment.hospital_id)),
                func.sum(Equipment.eq_count),
            )
            .where(
                Equipment.year == year,
                Equipment.category == category,
                Equipment.model.is_not(None),
                Equipment.model != "",
            )
            .group_by(Equipment.model)
        )
    ).all()
    rows.sort(key=lambda r: (-(r[1] or 0), r[0]))
    used: dict[str, int] = {}
    out = []
    for model, hospitals, units in rows:
        base = slugify_model(model)
        n = used.get(base, 0) + 1
        used[base] = n
        out.append(
            {
                "model": model,
                "slug": base if n == 1 else f"{base}-{n}",
                "hospitals": hospitals or 0,
                "units": units or 0,
            }
        )
    return _cache_put(key, out)


async def _find_model(db: AsyncSession, category: str, slug: str) -> tuple[dict, int, int]:
    """slug -> (모델 행, 0-based 순위, 분류 내 전체 모델 수)."""
    models = await _category_models(db, category, await _latest_year(db))
    for i, row in enumerate(models):
        if row["slug"] == slug:
            return row, i, len(models)
    raise HTTPException(404, "해당 분류에서 모델을 찾을 수 없습니다")


async def _dist_by_hospital_column(
    db: AsyncSession, column, year: int, category: str, model: Optional[str] = None
) -> list[dict]:
    """장비 조건 → hospitals의 한 컬럼(종별/시도)별 보유 기관 수·대수. 서버 집계."""
    q = (
        select(column, func.count(func.distinct(Equipment.hospital_id)), func.sum(Equipment.eq_count))
        .join(Hospital, Hospital.id == Equipment.hospital_id)
        .where(Equipment.year == year, Equipment.category == category)
        .group_by(column)
    )
    if model is not None:
        q = q.where(Equipment.model == model)
    rows = [(k, h or 0, u or 0) for k, h, u in (await db.execute(q)).all()]
    total = sum(r[1] for r in rows) or 1
    rows.sort(key=lambda r: -r[1])
    return [{"key": k or "미분류", "hospitals": h, "units": u, "share": round(h / total * 100, 1)} for k, h, u in rows]


async def _year_series(db: AsyncSession, category: str, model: Optional[str] = None) -> list[dict]:
    q = (
        select(Equipment.year, func.count(func.distinct(Equipment.hospital_id)), func.sum(Equipment.eq_count))
        .where(Equipment.category == category, Equipment.source != "manual")
        .group_by(Equipment.year)
        .order_by(Equipment.year)
    )
    if model is not None:
        q = q.where(Equipment.model == model)
    return [{"year": y, "hospitals": h or 0, "units": u or 0} for y, h, u in (await db.execute(q)).all()]


async def _has_manufacturer_confidence(db: AsyncSession) -> bool:
    """equipment.manufacturer_confidence 컬럼이 이미 생겼는지 — 없으면 신뢰도 배지를 감춘다.

    제조사 적재가 별도 작업으로 진행 중이라 컬럼이 나중에 생길 수 있다. TTL 캐시라서 마이그레이션
    뒤 프로세스를 재시작하지 않아도 10분 안에 반영된다.
    """
    cached = _cache_get("has_conf")
    if cached is not None:
        return cached
    try:
        cols = (await db.execute(text("PRAGMA table_info(equipment)"))).all()
        found = any(r[1] == "manufacturer_confidence" for r in cols)
    except Exception:
        found = False
    return _cache_put("has_conf", found)


async def _manufacturer_rows(db: AsyncSession, year: int) -> dict:
    """제조사 × 분류 집계를 한 번에 읽어 제조사 단위로 접는다 (idx_eq_mfr_cover 커버링, ~65ms).

    count(distinct hospital_id)는 분류별 값이라 제조사 단위로 합산할 수 없어서, 제조사별
    보유 기관 수만 따로 한 번 더 집계한다."""
    key = f"mfr:{year}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    has_conf = await _has_manufacturer_confidence(db)
    cols = [
        Equipment.manufacturer,
        Equipment.category,
        func.count(func.distinct(Equipment.model)),
        func.count(func.distinct(Equipment.hospital_id)),
        func.sum(Equipment.eq_count),
        func.count(),
    ]
    pair_q = (
        select(*cols)
        .where(Equipment.year == year, Equipment.manufacturer.is_not(None), Equipment.manufacturer != "")
        .group_by(Equipment.manufacturer, Equipment.category)
    )
    pairs = (await db.execute(pair_q)).all()

    mfr_q = (
        select(
            Equipment.manufacturer,
            func.count(func.distinct(Equipment.hospital_id)),
            func.count(func.distinct(Equipment.model)),
        )
        .where(Equipment.year == year, Equipment.manufacturer.is_not(None), Equipment.manufacturer != "")
        .group_by(Equipment.manufacturer)
    )
    totals = {m: (h or 0, md or 0) for m, h, md in (await db.execute(mfr_q)).all()}

    conf: dict[str, dict[str, int]] = {}
    if has_conf:
        conf_q = text(
            "SELECT manufacturer, manufacturer_confidence, COUNT(*) FROM equipment "
            "WHERE year = :y AND manufacturer IS NOT NULL AND manufacturer <> '' "
            "AND manufacturer_confidence IS NOT NULL "
            "GROUP BY manufacturer, manufacturer_confidence"
        )
        for m, c, n in (await db.execute(conf_q, {"y": year})).all():
            conf.setdefault(m, {})[c] = n

    index = await _catalog_index(db)
    grouped: dict[str, dict] = {}
    filled_rows = 0
    for mfr, cat, models, hospitals, units, nrows in pairs:
        filled_rows += nrows or 0
        g = grouped.setdefault(mfr, {"manufacturer": mfr, "units": 0, "categories": []})
        g["units"] += units or 0
        g["categories"].append(
            {
                "category": cat,
                "name": index.get(cat, {}).get("name", cat),
                "models": models or 0,
                "hospitals": hospitals or 0,
                "units": units or 0,
            }
        )
    out = []
    for mfr, g in grouped.items():
        g["categories"].sort(key=lambda c: -c["units"])
        hospitals, models = totals.get(mfr, (0, 0))
        out.append(
            {
                "manufacturer": mfr,
                "models": models,
                "hospitals": hospitals,
                "units": g["units"],
                "category_count": len(g["categories"]),
                # 행을 펼쳤을 때 보여줄 분량만. 제조사가 수천으로 늘어나도 응답 크기가 터지지 않게 8개로 자른다.
                "categories": g["categories"][:8],
                "confidence": conf.get(mfr) or None,
            }
        )
    out.sort(key=lambda r: (-r["units"], r["manufacturer"]))
    return _cache_put(key, {"rows": out, "filled_rows": filled_rows, "has_confidence": bool(conf)})


@router.get("/catalog/categories")
async def catalog_categories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
):
    """장비 분류 전체 목록 (196종) — 분류명/코드/보유 기관 수/등록 대수/모델 수.

    검색 컨트롤 없이 링크로만 내려가는 화면용이라 전량을 한 번에 내려준다(196행).
    집계 두 번(분류별 + 전체)은 idx_eq_year_cat_cover 커버링 인덱스로 끝나고, 결과는 600초 캐시한다.
    """
    year = await _latest_year(db)
    cached = _cache_get(f"categories:{year}")
    if cached is not None:
        return cached

    rows = (
        await db.execute(
            select(
                Equipment.category,
                func.count(func.distinct(Equipment.hospital_id)),
                func.sum(Equipment.eq_count),
                func.count(func.distinct(Equipment.model)),
            )
            .where(Equipment.year == year)
            .group_by(Equipment.category)
        )
    ).all()
    total_h, total_u, total_m = (
        await db.execute(
            select(
                func.count(func.distinct(Equipment.hospital_id)),
                func.sum(Equipment.eq_count),
                func.count(func.distinct(Equipment.model)),
            ).where(Equipment.year == year)
        )
    ).one()

    index = await _catalog_index(db)
    items = [
        {
            "category": c,
            "code": index.get(c, {}).get("code", c),
            "name": index.get(c, {}).get("name", c),
            "hospitals": h or 0,
            "units": u or 0,
            "models": m or 0,
        }
        for c, h, u, m in rows
    ]
    items.sort(key=lambda r: (-r["hospitals"], r["name"]))
    return _cache_put(
        f"categories:{year}",
        {
            "year": year,
            "totals": {
                "categories": len(items),
                "hospitals": total_h or 0,
                "units": total_u or 0,
                "models": total_m or 0,
            },
            "items": items,
        },
    )


@router.get("/catalog/categories/{category}")
async def catalog_category_detail(
    category: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
):
    """분류 상세 — 지표 4종 + 종별 분포 + 지역 분포 + 연도별 추이 + 다수 보유 기관."""
    year = await _latest_year(db)
    info = await _catalog_category(db, category)
    cached = _cache_get(f"cat:{category}:{year}")
    if cached is not None:
        return cached

    models = await _category_models(db, category, year)
    hospitals, units = (
        await db.execute(
            select(func.count(func.distinct(Equipment.hospital_id)), func.sum(Equipment.eq_count)).where(
                Equipment.year == year, Equipment.category == category
            )
        )
    ).one()

    types = await _dist_by_hospital_column(db, Hospital.type, year, category)
    regions = await _dist_by_hospital_column(db, Hospital.sido, year, category)
    years = await _year_series(db, category)

    top_rows = (
        await db.execute(
            select(
                Equipment.hospital_id,
                Hospital.name,
                Hospital.type,
                Hospital.sido,
                Hospital.sigungu,
                func.sum(Equipment.eq_count).label("units"),
            )
            .join(Hospital, Hospital.id == Equipment.hospital_id)
            .where(Equipment.year == year, Equipment.category == category)
            .group_by(Equipment.hospital_id)
            .order_by(func.sum(Equipment.eq_count).desc(), Hospital.name)
            .limit(10)
        )
    ).all()

    return _cache_put(
        f"cat:{category}:{year}",
        {
            **info,
            "year": year,
            "stats": {
                "hospitals": hospitals or 0,
                "units": units or 0,
                "models": len(models),
                "top_type": types[0] if types else None,
            },
            "types": types,
            "regions": regions,
            "years": years,
            "multi_year": len(years) > 1,
            "top_models": models[:12],
            "top_hospitals": [
                {
                    "hospital_id": hid,
                    "name": name,
                    "type": t,
                    "sido": sido,
                    "sigungu": sgg,
                    "units": u or 0,
                }
                for hid, name, t, sido, sgg, u in top_rows
            ],
        },
    )


@router.get("/catalog/categories/{category}/models")
async def catalog_category_models(
    category: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
):
    """분류별 전체 모델 목록 — 보유 기관 수 내림차순 고정, 페이지네이션."""
    year = await _latest_year(db)
    info = await _catalog_category(db, category)
    models = await _category_models(db, category, year)
    start = (page - 1) * page_size
    return {
        **info,
        "year": year,
        "total": len(models),
        "page": page,
        "page_size": page_size,
        "items": [{**m, "rank": start + i + 1} for i, m in enumerate(models[start : start + page_size])],
    }


@router.get("/catalog/categories/{category}/models/{slug}")
async def catalog_model_detail(
    category: str,
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
):
    """모델 상세 — 지표 + 종별/지역 분포 + 연도별 추이 + 같은 분류의 상위 모델."""
    year = await _latest_year(db)
    info = await _catalog_category(db, category)
    row, rank, total_models = await _find_model(db, category, slug)
    model = row["model"]

    cat_hospitals = (
        await db.execute(
            select(func.count(func.distinct(Equipment.hospital_id))).where(
                Equipment.year == year, Equipment.category == category
            )
        )
    ).scalar_one() or 0

    types = await _dist_by_hospital_column(db, Hospital.type, year, category, model)
    regions = await _dist_by_hospital_column(db, Hospital.sido, year, category, model)
    years = await _year_series(db, category, model)

    mfr_rows = (
        await db.execute(
            select(Equipment.manufacturer, func.sum(Equipment.eq_count))
            .where(
                Equipment.year == year,
                Equipment.category == category,
                Equipment.model == model,
                Equipment.manufacturer.is_not(None),
                Equipment.manufacturer != "",
            )
            .group_by(Equipment.manufacturer)
            .order_by(func.sum(Equipment.eq_count).desc())
        )
    ).all()

    peers = [m for m in (await _category_models(db, category, year))[:6] if m["slug"] != slug][:5]

    return {
        **info,
        "year": year,
        "model": model,
        "slug": slug,
        "stats": {
            "hospitals": row["hospitals"],
            "units": row["units"],
            "rank": rank + 1,
            "models_in_category": total_models,
            "share": round(row["hospitals"] / cat_hospitals * 100, 1) if cat_hospitals else 0.0,
            "top_type": types[0] if types else None,
        },
        "types": types,
        "regions": regions,
        "years": years,
        "multi_year": len(years) > 1,
        "manufacturers": [{"manufacturer": m, "units": u or 0} for m, u in mfr_rows],
        "peers": peers,
    }


@router.get("/catalog/categories/{category}/models/{slug}/hospitals")
async def catalog_model_hospitals(
    category: str,
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    sido: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """모델 보유 의료기관 목록 — 서버에서 GROUP BY + LIMIT/OFFSET."""
    year = await _latest_year(db)
    await _catalog_category(db, category)
    row, _, _ = await _find_model(db, category, slug)

    base = (
        select(Equipment.hospital_id)
        .join(Hospital, Hospital.id == Equipment.hospital_id)
        .where(Equipment.year == year, Equipment.category == category, Equipment.model == row["model"])
        .group_by(Equipment.hospital_id)
    )
    if sido:
        base = base.where(Hospital.sido == sido)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await db.execute(
            base.add_columns(
                Hospital.name,
                Hospital.type,
                Hospital.sido,
                Hospital.sigungu,
                Hospital.address,
                Hospital.hospital_profile_id,
                func.sum(Equipment.eq_count).label("units"),
            )
            .order_by(func.sum(Equipment.eq_count).desc(), Hospital.name)
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
    ).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "hospital_id": hid,
                "name": name,
                "type": t,
                "sido": sd,
                "sigungu": sgg,
                "address": addr,
                "is_member": profile_id is not None,
                "units": u or 0,
            }
            for hid, name, t, sd, sgg, addr, profile_id, u in rows
        ],
    }


@router.get("/catalog/manufacturers")
async def catalog_manufacturers(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    sort: str = Query("units", pattern="^(units|models|hospitals|name)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
):
    """제조·수입사 목록 — 연결 모델 수 / 보유 기관 수 / 등록 대수 / 분류 구성.

    제조사 적재가 끝나지 않은 상태에서도 화면이 깨지지 않도록 coverage(제조사가 채워진 행 비율)와
    available 플래그를 같이 내려준다. has_confidence는 manufacturer_confidence 컬럼이 있고
    값이 실제로 하나 이상 채워졌을 때만 true다 — 컬럼만 생기고 값은 비어 있는 중간 상태가 있다.
    """
    year = await _latest_year(db)
    agg = await _manufacturer_rows(db, year)
    rows = agg["rows"]
    has_conf = agg["has_confidence"]

    # 제조사가 채워진 행 수는 위 집계에서 그대로 나온다. 전체 행 수만 따로 세면 되는데
    # COUNT(*) FILTER는 인덱스를 못 써서 1.1s, 조건 없는 COUNT는 커버링 인덱스로 23ms다.
    cov_key = f"mfrcov:{year}"
    total_rows = _cache_get(cov_key)
    if total_rows is None:
        total_rows = _cache_put(
            cov_key, (await db.execute(select(func.count()).where(Equipment.year == year))).scalar_one()
        )
    coverage = {"filled_rows": agg["filled_rows"], "total_rows": total_rows or 0}

    key = {"units": lambda r: (-r["units"], r["manufacturer"]),
           "models": lambda r: (-r["models"], r["manufacturer"]),
           "hospitals": lambda r: (-r["hospitals"], r["manufacturer"]),
           "name": lambda r: (r["manufacturer"].lower(), r["manufacturer"])}[sort]
    ordered = sorted(rows, key=key)
    start = (page - 1) * page_size
    return {
        "year": year,
        "available": bool(rows),
        "has_confidence": has_conf,
        "sort": sort,
        "coverage": {
            **coverage,
            "share": round((coverage["filled_rows"] / coverage["total_rows"]) * 100, 1)
            if coverage["total_rows"]
            else 0.0,
        },
        "totals": {
            "manufacturers": len(rows),
            "models": sum(r["models"] for r in rows),
            "units": sum(r["units"] for r in rows),
        },
        "total": len(ordered),
        "page": page,
        "page_size": page_size,
        "items": [{**r, "rank": start + i + 1} for i, r in enumerate(ordered[start : start + page_size])],
    }
