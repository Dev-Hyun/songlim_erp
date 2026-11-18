"""보유 기간(교체 시기) — 영업지도의 교체 영업 신호.

정의: 분류의 최신 공공데이터 연도에 등록된 (병원, 분류, 모델)마다 한 해씩 거슬러 올라가며
같은 병원이 같은 모델을 연속 등록한 해 수를 센다(MEDIDOCS transforms/tenure.py 와 같은 규칙).
  - 중간에 한 해라도 빠지면 거기서 끊는다.
  - 모델이 바뀌면 새 모델은 바뀐 해부터 다시 센다(모델명 문자열이 같아야 같은 모델).
  - 최신 연도에 없는 모델(이미 교체·폐기)은 보유 기간이 없다.
  - 분류의 첫 데이터 연도까지 이어졌으면 그 전부터 있었을 수 있으므로 capped=True("N년 이상").
  - 수동 등록(source='manual')은 연도가 '스냅샷 연도'가 아니라 직원이 적은 값이라 뺀다.
병원은 hospitals.id 하나가 전 연도에 걸쳐 같은 기관이다(레거시 6분류 2019~2025,
심평원 전체 분류는 2023~2025를 ykiho로 매칭). 기관이 재개설 등으로 새 id를 받았으면 짧게 잡힌다(보수적).

계산은 영업지도가 이미 읽어 오는 장비 행으로 파이썬에서 한다 — 별도 테이블/마이그레이션 없음.
"""
import time
from typing import Iterable, NamedTuple, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Equipment


class Tenure(NamedTuple):
    years: int
    since_year: int
    capped: bool  # 첫 데이터 연도부터 이어짐 → 실제로는 더 길 수 있다


def model_tenure(
    rows: Iterable[tuple[int, int, Optional[str]]], first_year: int, latest_year: int
) -> dict[tuple[int, Optional[str]], Tenure]:
    """rows: (hospital_id, year, model). 반환: {(hospital_id, model): Tenure} — latest_year 에 있는 것만."""
    # 모델명이 없는 행은 서로 다른 장비일 수 있어 같은 모델로 이어 세지 않는다
    have = {(h, y, m) for h, y, m in rows if m and str(m).strip()}
    out = {}
    for hid, year, model in have:
        if year != latest_year:
            continue
        since = latest_year
        while (hid, since - 1, model) in have:
            since -= 1
        out[(hid, model)] = Tenure(latest_year - since + 1, since, since <= first_year)
    return out


# 분류별 (첫 연도, 최신 연도). 인덱스(idx_eq_cat_year)로 1~5ms지만 상세 화면은 분류가 수십 개라 캐시한다.
# 연도 범위는 임포트 때만 바뀐다 — 임포트 직후에도 10분 안에 새 연도를 따라가도록 짧게 둔다.
_SPAN_TTL = 600.0
_span_cache: dict[str, tuple[float, Optional[tuple[int, int]]]] = {}


async def snapshot_span(db: AsyncSession, category: str) -> Optional[tuple[int, int]]:
    hit = _span_cache.get(category)
    if hit is not None and time.monotonic() - hit[0] < _SPAN_TTL:
        return hit[1]
    base = select(Equipment.year).where(Equipment.category == category, Equipment.source != "manual").limit(1)
    # 한 번 왕복으로 — 둘 다 ORDER BY year LIMIT 1 이라 인덱스 양 끝만 본다
    first, latest = (await db.execute(
        select(base.order_by(Equipment.year).scalar_subquery(), base.order_by(Equipment.year.desc()).scalar_subquery())
    )).one()
    span = (first, latest) if latest is not None else None
    _span_cache[category] = (time.monotonic(), span)
    return span


async def tenure_by_row_key(db: AsyncSession, rows) -> dict[tuple[str, int, Optional[str]], Tenure]:
    """한 병원의 Equipment 행들 → {(분류, 최신 연도, 모델): Tenure}. 상세 화면의 연도별 행에 붙이는 용도."""
    out = {}
    for cat in {r.category for r in rows}:
        span = await snapshot_span(db, cat)
        if span is None:
            continue
        t = model_tenure(
            ((r.hospital_id, r.year, r.model) for r in rows if r.category == cat and r.source != "manual"), *span
        )
        out.update({(cat, span[1], model): v for (_, model), v in t.items()})
    return out


def tenure_fields(t: Optional[Tenure]) -> dict:
    """API 응답에 붙이는 칸 — 값이 없으면 모두 None."""
    return {
        "tenure_years": t.years if t else None,
        "since_year": t.since_year if t else None,
        "tenure_capped": t.capped if t else None,
    }
