from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

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


@router.get("/summary")
async def stats_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: str = "us",
    year: int = 2025,
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
    type_group: Optional[str] = None,
):
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
    eq_rows = (await db.execute(base)).scalars().all()

    total_equipment = sum(e.eq_count for e in eq_rows)
    hospitals_with_eq = {e.hospital_id for e in eq_rows}
    makers = {e.manufacturer for e in eq_rows if e.manufacturer}
    models = {e.model for e in eq_rows if e.model}

    hosp_q = select(Hospital.id)
    if sido:
        hosp_q = hosp_q.where(Hospital.sido == sido)
    if sigungu:
        hosp_q = hosp_q.where(Hospital.sigungu == sigungu)
    if tf is not None:
        hosp_q = hosp_q.where(tf)
    all_hosp_ids = set((await db.execute(hosp_q)).scalars().all())
    no_equipment_count = len(all_hosp_ids - hospitals_with_eq)

    return {
        "total_equipment": total_equipment,
        "hospitals_with_equipment": len(hospitals_with_eq),
        "maker_count": len(makers),
        "model_count": len(models),
        "no_equipment_count": no_equipment_count,
    }


@router.get("/market-share")
async def market_share(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: str = "us",
    year: int = 2025,
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
    type_group: Optional[str] = None,
    by: str = "maker",  # maker | model
):
    field = Equipment.manufacturer if by == "maker" else Equipment.model
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
    by: str = "maker",
):
    field = Equipment.manufacturer if by == "maker" else Equipment.model

    latest_q = (
        select(field, func.sum(Equipment.eq_count))
        .join(Hospital, Hospital.id == Equipment.hospital_id)
        .where(Equipment.category == category, Equipment.year == 2025, Equipment.model.is_not(None))
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

    years = list(range(2019, 2026))
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
    year: int = 2025,
    maker: Optional[str] = None,
):
    q = (
        select(Hospital.sido, func.sum(Equipment.eq_count))
        .join(Equipment, Equipment.hospital_id == Hospital.id)
        .where(Equipment.category == category, Equipment.year == year, Equipment.model.is_not(None), Hospital.sido.is_not(None))
    )
    if maker:
        q = q.where(Equipment.manufacturer == maker)
    q = q.group_by(Hospital.sido).order_by(func.sum(Equipment.eq_count).desc()).limit(17)
    rows = (await db.execute(q)).all()
    return [{"sido": r[0], "count": r[1]} for r in rows]


@router.get("/by-type")
async def by_type(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: str = "us",
    year: int = 2025,
    maker: Optional[str] = None,
):
    q = (
        select(Hospital.type, func.sum(Equipment.eq_count))
        .join(Equipment, Equipment.hospital_id == Hospital.id)
        .where(Equipment.category == category, Equipment.year == year, Equipment.model.is_not(None), Hospital.type.is_not(None))
    )
    if maker:
        q = q.where(Equipment.manufacturer == maker)
    q = q.group_by(Hospital.type).order_by(func.sum(Equipment.eq_count).desc())
    rows = (await db.execute(q)).all()
    return [{"type": r[0], "count": r[1]} for r in rows]
