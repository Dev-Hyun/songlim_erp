from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.brand_map import brand_expr as _brand_expr
from app.database import get_db
from app.models import Equipment, Hospital, User
from app.routers.auth import require_staff

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _type_filter(type_group: Optional[str]):
    if type_group == "clinic":
        return Hospital.type.ilike("%의원%")
    if type_group == "hospital":
        return Hospital.type.ilike("%병원%") & ~Hospital.type.ilike("%종합%") & ~Hospital.type.ilike("%상급%")
    if type_group == "general":
        return Hospital.type.ilike("%종합%") | Hospital.type.ilike("%상급%")
    return None


async def _latest_year(db: AsyncSession) -> int:
    """스냅샷 기준 최신 연도. 2025 를 코드에 박아두면 새 스냅샷이 들어와도 화면이 조용히
    옛 연도를 계속 보여준다. med_stats._latest_year() 와 같은 규칙 — 수기 등록은 임의 연도가
    들어올 수 있으므로 심평원 일괄 import 연도만 본다."""
    return (
        await db.execute(select(func.max(Equipment.year)).where(Equipment.source == "import"))
    ).scalar_one()


@router.get("/summary")
async def stats_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: str = "us",
    year: int = 0,  # 0 = 최신 스냅샷
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
    type_group: Optional[str] = None,
):
    year = year or await _latest_year(db)
    base = select(Equipment).join(Hospital, Hospital.id == Equipment.hospital_id).where(
        Equipment.category == category, Equipment.year == year, Equipment.model.is_not(None)
    )
    if sido:
        base = base.where(Hospital.sido == sido)
    if sigungu:
        base = base.where(Hospital.sigungu == sigungu)
    tf = _type_filter(type_group)
    if tf is not None:
        base = base.where(tf)
    # 집계는 SQL 한 번으로 끝낸다. 예전에는 Equipment ORM 객체를 전부 메모리에 올려
    # 파이썬에서 셌는데(분류에 따라 4만 행), 셀 값은 SUM/COUNT(DISTINCT) 면 충분하다.
    agg = (await db.execute(
        base.with_only_columns(
            func.coalesce(func.sum(Equipment.eq_count), 0),
            func.count(func.distinct(Equipment.hospital_id)),
            func.count(func.distinct(_brand_expr())),
            func.count(func.distinct(Equipment.model)),
        )
    )).one()
    total_equipment, hospitals_with_eq, maker_count, model_count = agg

    hosp_q = select(func.count()).select_from(Hospital)
    if sido:
        hosp_q = hosp_q.where(Hospital.sido == sido)
    if sigungu:
        hosp_q = hosp_q.where(Hospital.sigungu == sigungu)
    if tf is not None:
        hosp_q = hosp_q.where(tf)
    no_equipment_count = (await db.execute(hosp_q)).scalar_one() - hospitals_with_eq

    return {
        "total_equipment": total_equipment,
        "hospitals_with_equipment": hospitals_with_eq,
        "maker_count": maker_count,
        "model_count": model_count,
        "no_equipment_count": no_equipment_count,
    }


@router.get("/market-share")
async def market_share(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: str = "us",
    year: int = 0,  # 0 = 최신 스냅샷
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
    type_group: Optional[str] = None,
    by: str = "maker",  # maker | model | series (series는 X-ray 전용)
):
    year = year or await _latest_year(db)
    field = _brand_expr() if by == "maker" else (Equipment.model_series if by == "series" else Equipment.model)
    q = (
        select(field, func.sum(Equipment.eq_count))
        .join(Hospital, Hospital.id == Equipment.hospital_id)
        .where(Equipment.category == category, Equipment.year == year, Equipment.model.is_not(None))
    )
    if sido:
        q = q.where(Hospital.sido == sido)
    if sigungu:
        q = q.where(Hospital.sigungu == sigungu)
    tf = _type_filter(type_group)
    if tf is not None:
        q = q.where(tf)
    q = q.group_by(field).order_by(func.sum(Equipment.eq_count).desc())
    rows = (await db.execute(q)).all()
    total = sum(r[1] for r in rows) or 1
    return [
        {"label": r[0] or "미상", "count": r[1], "share": round(r[1] / total * 100, 1)}
        for r in rows
    ]


@router.get("/yearly-trend")
async def yearly_trend(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: str = "us",
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
    type_group: Optional[str] = None,
    top_n: int = 8,
    by: str = "maker",  # maker | model | series (series는 X-ray 전용)
):
    latest = await _latest_year(db)
    field = _brand_expr() if by == "maker" else (Equipment.model_series if by == "series" else Equipment.model)

    latest_q = (
        select(field, func.sum(Equipment.eq_count))
        .join(Hospital, Hospital.id == Equipment.hospital_id)
        .where(Equipment.category == category, Equipment.year == latest, Equipment.model.is_not(None))
    )
    if sido:
        latest_q = latest_q.where(Hospital.sido == sido)
    if sigungu:
        latest_q = latest_q.where(Hospital.sigungu == sigungu)
    tf = _type_filter(type_group)
    if tf is not None:
        latest_q = latest_q.where(tf)
    latest_q = latest_q.group_by(field).order_by(func.sum(Equipment.eq_count).desc()).limit(top_n)
    top_labels = [r[0] for r in (await db.execute(latest_q)).all() if r[0]]

    years = list(range(2019, latest + 1))
    data: dict[str, list[int]] = {label: [0] * len(years) for label in top_labels}
    for idx, yr in enumerate(years):
        q = (
            select(field, func.sum(Equipment.eq_count))
            .join(Hospital, Hospital.id == Equipment.hospital_id)
            .where(Equipment.category == category, Equipment.year == yr, field.in_(top_labels))
        )
        if sido:
            q = q.where(Hospital.sido == sido)
        if sigungu:
            q = q.where(Hospital.sigungu == sigungu)
        if tf is not None:
            q = q.where(tf)
        q = q.group_by(field)
        for label, count in (await db.execute(q)).all():
            if label in data:
                data[label][idx] = count

    return {"years": years, "labels": top_labels, "data": data}


@router.get("/by-region")
async def by_region(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: str = "us",
    year: int = 0,  # 0 = 최신 스냅샷
    maker: Optional[str] = None,
):
    year = year or await _latest_year(db)
    q = (
        select(Hospital.sido, func.sum(Equipment.eq_count))
        .join(Equipment, Equipment.hospital_id == Hospital.id)
        .where(Equipment.category == category, Equipment.year == year, Equipment.model.is_not(None), Hospital.sido.is_not(None))
    )
    if maker:
        q = q.where(_brand_expr() == maker)
    q = q.group_by(Hospital.sido).order_by(func.sum(Equipment.eq_count).desc()).limit(17)
    rows = (await db.execute(q)).all()
    return [{"sido": r[0], "count": r[1]} for r in rows]


@router.get("/by-type")
async def by_type(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: str = "us",
    year: int = 0,  # 0 = 최신 스냅샷
    maker: Optional[str] = None,
):
    year = year or await _latest_year(db)
    q = (
        select(Hospital.type, func.sum(Equipment.eq_count))
        .join(Equipment, Equipment.hospital_id == Hospital.id)
        .where(Equipment.category == category, Equipment.year == year, Equipment.model.is_not(None), Hospital.type.is_not(None))
    )
    if maker:
        q = q.where(_brand_expr() == maker)
    q = q.group_by(Hospital.type).order_by(func.sum(Equipment.eq_count).desc())
    rows = (await db.execute(q)).all()
    return [{"type": r[0], "count": r[1]} for r in rows]
