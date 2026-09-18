"""의료기관 데이터 조회 (장비 검색 / 개설 현황 / 분포 현황).

equipment 976K행 · hospitals 64K행이므로 모든 집계는 SQL GROUP BY로 서버에서 끝내고,
목록은 반드시 페이지네이션한다. 원시 행을 프론트로 내려보내지 않는다.

장비 분류는 심평원 전체 장비군(195 대분류)이라 하드코딩하지 않고 DB에서 읽는다
(equipment.category / category_name — scripts/import_hira_equipment_full.py 참고).
"""

import time
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Equipment, Hospital, User
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
# 2. 의료기관 개설 현황
#
# hospitals.estb_date (심평원 병원정보서비스 개설일자, YYYY-MM-DD)를 그대로 집계한다.
# estb_date가 없는 기관은 모든 개설 집계에서 빠지므로 summary가 그 수를 함께 내려준다.
# ⚠️ 폐업·휴업 일자는 심평원 병원정보서비스에 존재하지 않는다. 추정하지 말고 제공하지 않는다.
# ────────────────────────────────────────────────────────
PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90}
PERIOD_YEARS = {"1y": 1, "3y": 3, "5y": 5}


def _minus_years(d: date, n: int) -> date:
    try:
        return d.replace(year=d.year - n)
    except ValueError:  # 2월 29일
        return d.replace(year=d.year - n, day=28)


def _period_range(period: str) -> tuple[Optional[str], str]:
    """기간 프리셋 → (시작일 포함, 오늘). 전체 기간이면 시작일은 None."""
    today = date.today()
    if period == "all":
        return None, today.isoformat()
    if period in PERIOD_DAYS:
        start = today - timedelta(days=PERIOD_DAYS[period])
    elif period in PERIOD_YEARS:
        start = _minus_years(today, PERIOD_YEARS[period])
    else:
        raise HTTPException(400, "알 수 없는 기간입니다")
    return start.isoformat(), today.isoformat()


def _opened_between(q: Select, start: Optional[str], end: str) -> Select:
    """개설일자가 [start, end] 안인 기관만. YYYY-MM-DD 문자열이라 사전순 비교 = 날짜순 비교."""
    q = q.where(Hospital.estb_date.is_not(None), Hospital.estb_date <= end)
    if start:
        q = q.where(Hospital.estb_date >= start)
    return q


async def _count(db: AsyncSession, q: Select) -> int:
    return (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()


@router.get("/openings/summary")
async def openings_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    period: str = "1y",
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
    type_group: Optional[str] = None,
):
    """선택 기간의 실제 개설 건수 + 직전 동일 길이 기간 대비 증감."""
    start, end = _period_range(period)
    base = _apply_hospital_filters(select(Hospital.id), sido, sigungu, type_group, None)

    total = await _count(db, base)
    with_date = await _count(db, base.where(Hospital.estb_date.is_not(None)))
    opened = await _count(db, _opened_between(base, start, end))

    prev_start = prev_end = None
    opened_prev = None
    if start:
        s = date.fromisoformat(start)
        prev_end_d = s - timedelta(days=1)
        prev_start_d = prev_end_d - (date.fromisoformat(end) - s)
        prev_start, prev_end = prev_start_d.isoformat(), prev_end_d.isoformat()
        opened_prev = await _count(db, _opened_between(base, prev_start, prev_end))

    latest = (await db.execute(base.with_only_columns(func.max(Hospital.estb_date)))).scalar_one()

    return {
        "period": period,
        "start": start,
        "end": end,
        "prev_start": prev_start,
        "prev_end": prev_end,
        "total_hospitals": total,
        "with_estb_date": with_date,
        "missing_estb_date": total - with_date,
        "opened": opened,
        "opened_prev": opened_prev,
        "delta": None if opened_prev is None else opened - opened_prev,
        "latest_estb_date": latest,
        # 폐업·휴업 일자는 원천 데이터에 없다 — 화면에서 "데이터 없음"으로 표기한다.
        "closures_available": False,
    }


@router.get("/openings/trend")
async def openings_trend(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    period: str = "1y",
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
    type_group: Optional[str] = None,
):
    """개설 추이 — 90일 이하는 일별, 3년 이하는 월별, 그 이상은 연별 버킷."""
    start, end = _period_range(period)
    base = _apply_hospital_filters(select(Hospital.id), sido, sigungu, type_group, None)
    if start is None:
        start = (
            await db.execute(base.with_only_columns(func.min(Hospital.estb_date)))
        ).scalar_one() or end

    start_d, end_d = date.fromisoformat(start), date.fromisoformat(end)
    span = (end_d - start_d).days
    if span <= 92:
        gran, width = "day", 10
    elif span <= 1100:
        gran, width = "month", 7
    else:
        gran, width = "year", 4

    # 월/연 버킷은 달력 경계에 맞춰 잘라야 첫 막대가 반쪽짜리가 되지 않는다.
    if gran == "month":
        start_d = start_d.replace(day=1)
    elif gran == "year":
        start_d = start_d.replace(month=1, day=1)
    start = start_d.isoformat()

    bucket = func.substr(Hospital.estb_date, 1, width)
    q = _opened_between(
        _apply_hospital_filters(
            select(bucket.label("bucket"), func.count()), sido, sigungu, type_group, None
        ),
        start,
        end,
    ).group_by(bucket)
    counts = dict((await db.execute(q)).all())

    keys: list[str] = []
    if gran == "day":
        d = start_d
        while d <= end_d:
            keys.append(d.isoformat())
            d += timedelta(days=1)
    elif gran == "month":
        y, m = start_d.year, start_d.month
        while (y, m) <= (end_d.year, end_d.month):
            keys.append(f"{y:04d}-{m:02d}")
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    else:
        keys = [f"{y:04d}" for y in range(start_d.year, end_d.year + 1)]

    return {
        "granularity": gran,
        "start": start,
        "end": end,
        "points": [{"bucket": k, "count": counts.get(k, 0)} for k in keys],
    }


@router.get("/openings/by-region")
async def openings_by_region(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    period: str = "1y",
    sido: Optional[str] = None,
    type_group: Optional[str] = None,
):
    """지역별 전체 기관 수 + 해당 기간 개설 수. sido를 주면 시군구 단위로 내려간다."""
    level_col = Hospital.sigungu if sido else Hospital.sido
    start, end = _period_range(period)

    def _level_q():
        return _apply_hospital_filters(
            select(level_col, func.count()).where(level_col.is_not(None)), sido, None, type_group, None
        )

    totals = dict((await db.execute(_level_q().group_by(level_col))).all())
    opened = dict((await db.execute(_opened_between(_level_q(), start, end).group_by(level_col))).all())

    rows = [{"region": r, "total": totals.get(r, 0), "opened": opened.get(r, 0)} for r in totals]
    rows.sort(key=lambda r: (-r["opened"], -r["total"]))
    return {
        "level": "sigungu" if sido else "sido",
        "period": period,
        "start": start,
        "end": end,
        "rows": rows,
    }


@router.get("/openings/new-list")
async def openings_new_list(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    period: str = "1y",
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
    type_group: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
):
    """해당 기간에 개설된 의료기관 목록 (개설일자 최신순, 페이지네이션)."""
    start, end = _period_range(period)
    q = _opened_between(
        _apply_hospital_filters(select(Hospital), sido, sigungu, type_group, None), start, end
    )
    total = await _count(db, q)
    rows = (
        await db.execute(
            q.order_by(Hospital.estb_date.desc(), Hospital.name)
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
    ).scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "period": period,
        "start": start,
        "end": end,
        "items": [
            {
                "hospital_id": h.id,
                "name": h.name,
                "type": h.type,
                "sido": h.sido,
                "sigungu": h.sigungu,
                "address": h.address,
                "estb_date": h.estb_date,
            }
            for h in rows
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
