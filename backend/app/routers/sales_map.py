import math
import os
import xml.etree.ElementTree as ET
from datetime import date
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, text, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.brand_map import brand_expr as _brand_expr, display_maker as _display_of
from app.manufacturer_map import model_series as _compute_model_series
from app.models import Hospital, Equipment, SalesNote, User, PersonalMemo, MfdsDeviceItem
from app.routers.auth import require_staff
from app.tenure import model_tenure, snapshot_span, tenure_by_row_key, tenure_fields

router = APIRouter(prefix="/api", tags=["sales_map"])

HIRA_API_KEY = os.environ.get("HIRA_API_KEY", "")
HIRA_SEARCH_URL = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList"


def haversine(lat1, lng1, lat2, lng2):
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ────────────────────────────────────────────────────────
# 영업지도 조회
# 요구사항: 선택한 장비 대분류(us/xray/ct/mri)를 보유한 병원만 지도에 표시.
# 미보유 병원은 지도엔 안 나오되, 병원명 검색에는 나오고 항상 하단으로 정렬.
# 회원가입한 병원(hospital_profile_id 존재)은 회원 배지 표시.
# ────────────────────────────────────────────────────────
async def _query_hospitals(
    db: AsyncSession,
    lat: Optional[float],
    lng: Optional[float],
    radius_km: float,
    category: str,
    sido: Optional[str],
    sigungu: Optional[str],
    maker: Optional[str],
    model: Optional[str],
    name_search: Optional[str],
    map_only: bool,
    sort: str,
    min_tenure: Optional[int] = None,
):
    q = select(Hospital)
    if sido:
        q = q.where(Hospital.sido == sido)
    if sigungu:
        q = q.where(Hospital.sigungu == sigungu)
    if name_search:
        q = q.where(Hospital.name.ilike(f"%{name_search}%"))
    # 지도 표시 모드 + 좌표 있음: 전국 59,253건 전체 스캔을 피하기 위해 RTREE 공간인덱스로 후보 id를 먼저 좁힌 뒤 조회
    # (레거시에서 이 인덱스가 빠져있던 게 영업지도 로딩이 느렸던 원인이었음 — 개발요청서 5-4/DB ERD 참고)
    if map_only and lat is not None and lng is not None and not name_search:
        lat_d = radius_km / 111.0
        lng_d = radius_km / (111.0 * math.cos(math.radians(lat)))
        rtree_ids = (
            await db.execute(
                text(
                    "SELECT id FROM hospitals_rtree WHERE min_lat <= :max_lat AND max_lat >= :min_lat "
                    "AND min_lng <= :max_lng AND max_lng >= :min_lng"
                ),
                {"min_lat": lat - lat_d, "max_lat": lat + lat_d, "min_lng": lng - lng_d, "max_lng": lng + lng_d},
            )
        ).scalars().all()
        if not rtree_ids:
            return []
        q = q.where(Hospital.id.in_(rtree_ids))

    # 제조사/모델 조건은 SQL로 먼저 좁힌다. 지역 없이 제조사만 고르면 WHERE가 하나도 안 붙어
    # hospitals 89,295건 + 해당 분류 장비 전 연도를 ORM 객체로 전부 올린 뒤 파이썬에서 걸렀고,
    # 실측으로 요청 하나에 4초가 넘었다. 서브쿼리로 넘겨 바인드변수 한도도 피한다.
    # (연도를 좁히지 않으므로 아래 파이썬 필터가 잡아내는 '최신 연도' 조건의 상위집합이다 —
    #  걸러질 수 없는 병원만 미리 빠지므로 결과는 같다.)
    if maker or model:
        narrow = select(Equipment.hospital_id).where(Equipment.category == category)
        if maker:
            narrow = narrow.where(_brand_expr() == maker)
        if model:
            narrow = narrow.where(Equipment.model == model)
        q = q.where(Hospital.id.in_(narrow))

    # 보유 기간(app/tenure.py) — "N년 이상"이면 최신 연도와 N-1년 전 둘 다 이 분류가 있는 병원만
    # SQL로 먼저 좁힌다(idx_eq_year_cat_cover). 정확한 판정(같은 모델·빈 해 없음)은 아래 파이썬에서 한다.
    span = await snapshot_span(db, category)
    if min_tenure:
        start = span[1] - min_tenure + 1 if span else None
        if start is None or start < span[0]:
            return []  # 데이터 연도 범위로는 확인할 수 없는 기간
        for y in (span[1], start):
            q = q.where(Hospital.id.in_(
                select(Equipment.hospital_id).where(Equipment.year == y, Equipment.category == category)
            ))

    hospitals = (await db.execute(q)).scalars().all()

    hosp_ids = [h.id for h in hospitals]
    eq_rows = []
    BATCH = 500  # SQLite 바인드변수 한도 대응 — 전국 검색처럼 hosp_ids가 많을 때 IN절을 분할
    for i in range(0, len(hosp_ids), BATCH):
        batch = hosp_ids[i:i + BATCH]
        # 아래에서 쓰는 건 이 일곱 칸뿐이다. Equipment ORM 객체를 통째로 만들면
        # 전국 조회에서 수십만 개를 짓느라 시간이 다 간다.
        eq_q = (
            select(
                Equipment.hospital_id, Equipment.year, Equipment.category,
                Equipment.brand, Equipment.manufacturer, Equipment.model, Equipment.source,
            )
            .where(Equipment.hospital_id.in_(batch), Equipment.category == category)
            .order_by(Equipment.hospital_id, Equipment.year.desc())
        )
        eq_rows.extend((await db.execute(eq_q)).all())

    eq_by_hosp: dict[int, list] = {}
    for e in eq_rows:
        eq_by_hosp.setdefault(e.hospital_id, []).append(e)
    if maker:
        eq_by_hosp = {
            hid: rows for hid, rows in eq_by_hosp.items()
            if any(_display_maker(r) == maker for r in rows if r.year == rows[0].year)
        }
    if model:
        eq_by_hosp = {
            hid: rows for hid, rows in eq_by_hosp.items()
            if any(r.model == model for r in rows if r.year == rows[0].year)
        }

    # 병원별 보유 기간 후보 [(모델, Tenure)] — 지금 보유 중인 모델이 여럿이면 가장 오래된 것을 보여준다
    tenure_by_hosp: dict[int, list] = {}
    if span:
        tenures = model_tenure(((r.hospital_id, r.year, r.model) for r in eq_rows if r.source != "manual"), *span)
        # 제조사·모델로 거른 검색이면 그 조건에 맞는 모델의 보유 기간만 본다
        # (model=X 로 찾았는데 X는 올해 새로 들였고 다른 모델 Y가 오래된 병원이 '교체 대상'으로 잡히지 않게)
        wanted = None
        if maker or model:
            wanted = {
                (r.hospital_id, r.model) for r in eq_rows
                if r.year == span[1] and (not maker or _display_maker(r) == maker) and (not model or r.model == model)
            }
        for (hid, m), t in tenures.items():
            if wanted is None or (hid, m) in wanted:
                tenure_by_hosp.setdefault(hid, []).append((m, t))
    if min_tenure:
        eq_by_hosp = {
            hid: rows for hid, rows in eq_by_hosp.items()
            if any(t.years >= min_tenure for _, t in tenure_by_hosp.get(hid, []))
        }

    # 장비 미보유 병원은 병원명 검색일 때만 노출한다. 시도/제조사/모델 필터(map_only=False)는
    # 반경 제한만 풀 뿐 "장비 보유 병원만 보여준다"는 규칙과는 무관하므로 map_only가 아니라
    # name_search 여부로 따로 판단해야 한다 (map_only에 묶으면 지역/제조사로 필터링할 때
    # 근처 장비 미보유 병원까지 섞여 나오는 버그가 생김).
    require_equipment = not name_search

    results = []
    for h in hospitals:
        eq = eq_by_hosp.get(h.id, [])
        has_equipment = bool(eq)

        if require_equipment and not has_equipment:
            continue

        dist_km = None
        if lat is not None and lng is not None and h.lat is not None and h.lng is not None:
            dist_km = round(haversine(lat, lng, h.lat, h.lng), 2)
            if map_only and dist_km > radius_km:
                continue

        latest = eq[0] if eq else None
        # 같은 연수면 목록에 보이는 현재 모델을 고른다(엇갈려 보이지 않게), 그다음 모델명순
        tenure_model, tenure = max(
            tenure_by_hosp.get(h.id, []),
            key=lambda mt: (mt[1].years, latest is not None and mt[0] == latest.model, str(mt[0])),
            default=(None, None),
        )
        results.append({
            "id": h.id, "name": h.name, "type": h.type,
            "sido": h.sido, "sigungu": h.sigungu, "address": h.address,
            "lat": h.lat, "lng": h.lng, "dist_km": dist_km,
            "is_member": h.hospital_profile_id is not None,
            "has_equipment": has_equipment,
            "current_maker": _display_maker(latest) if latest else None,
            "current_model": latest.model if latest else None,
            "tenure_model": tenure_model,
            **tenure_fields(tenure),
        })

    # 검색 결과는 항상 장비 보유 병원 상단, 미보유 하단
    if sort == "maker":
        results.sort(key=lambda x: (not x["has_equipment"], x["current_maker"] or "zzz", x["name"]))
    elif sort == "name":
        results.sort(key=lambda x: (not x["has_equipment"], x["name"]))
    else:
        results.sort(key=lambda x: (not x["has_equipment"], x["dist_km"] if x["dist_km"] is not None else 9e9, x["name"]))

    return results


@router.get("/hospitals")
async def get_hospitals(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: float = 3.0,
    category: str = "us",
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
    maker: Optional[str] = None,
    model: Optional[str] = None,
    name_search: Optional[str] = None,
    map_only: bool = True,  # True: 지도 표시용(장비 보유만), False: 검색용(전체 + 정렬)
    sort: str = "dist",
    min_tenure: Optional[int] = None,  # 보유 N년 이상 — 같은 모델 연속 등록 연수(app/tenure.py)
):
    results = await _query_hospitals(db, lat, lng, radius_km, category, sido, sigungu, maker, model, name_search, map_only, sort, min_tenure)
    return results[:500]


@router.get("/hospitals/export")
async def export_hospitals_excel(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    lat: float = 37.5665,
    lng: float = 126.978,
    radius_km: float = 3.0,
    category: str = "us",
    sido: Optional[str] = None,
    sigungu: Optional[str] = None,
    maker: Optional[str] = None,
    model: Optional[str] = None,
    map_only: bool = True,
    min_tenure: Optional[int] = None,
):
    """영업지도 목록 Excel 내보내기 (레거시 /api/hospitals/export 참고)."""
    import io
    from urllib.parse import quote

    import openpyxl
    from fastapi.responses import StreamingResponse
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    results = await _query_hospitals(db, lat, lng, radius_km, category, sido, sigungu, maker, model, None, map_only, "name", min_tenure)
    cat_label = {"us": "초음파", "xray": "엑스레이", "ct": "CT", "mri": "MRI", "bmd": "BMD", "carm": "C-Arm"}.get(category, category)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"{cat_label} 영업지도"

    hdr_fill = PatternFill("solid", fgColor="1B64DA")
    hdr_font = Font(bold=True, color="FFFFFF", size=10)
    thin = Border(*(Side(style="thin", color="D5DDE5"),) * 4)
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)

    cols = ["순위", "병원명", "시도", "시군구", "병원종별", f"현재 {cat_label}장비", "제조사", "회원가입", "거리(km)",
            "보유 연수", "보유 시작", "보유 기준 모델"]
    ws.append(cols)
    for c in range(1, len(cols) + 1):
        cell = ws.cell(row=1, column=c)
        cell.fill = hdr_fill
        cell.font = hdr_font
        cell.alignment = center
        cell.border = thin

    for i, h in enumerate(results, start=1):
        row = [
            i, h["name"], h["sido"], h["sigungu"], h["type"],
            h["current_model"] or "-", h["current_maker"] or "-",
            "O" if h["is_member"] else "-", h["dist_km"] if h["dist_km"] is not None else "-",
            h["tenure_years"] or "-",
            # 첫 데이터 연도부터 이어진 경우 실제 시작은 그 이전일 수 있다
            (f"{h['since_year']}년 이전부터" if h["tenure_capped"] else f"{h['since_year']}년부터") if h["since_year"] else "-",
            h["tenure_model"] or "-",
        ]
        ws.append(row)
        for c in range(1, len(cols) + 1):
            ws.cell(row=i + 1, column=c).border = thin

    for col, width in zip("ABCDEFGHIJKL", [6, 26, 10, 12, 12, 22, 16, 10, 10, 10, 14, 22]):
        ws.column_dimensions[col].width = width

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"songlim_map_{category}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


@router.get("/hospital-search")
async def search_hospital(
    q: str = Query(..., min_length=2, description="검색할 병원명"),
    hospital_type: str = Query("일반", description="의원/병원/대학병원이면 심평원 실시간 검색, 동물병원이면 로컬 DB 검색"),
    db: AsyncSession = Depends(get_db),
):
    """회원가입 시 병원명 검색 자동완성 (DB구성요청서 3-1 참고).
    일반병원은 심평원 hospInfoServicev2를 실시간 조회, 동물병원은 로컬 hospitals 테이블(동물병원 마스터데이터 임포트 후)에서 검색.
    매칭 시 name/tel만 반환 — 주소 등 나머지 필드는 정책상 자동입력하지 않고 사용자가 직접 입력한다."""
    if hospital_type == "동물병원":
        rows = (
            await db.execute(
                select(Hospital)
                .where(Hospital.type == "동물병원", Hospital.name.ilike(f"%{q}%"))
                .limit(20)
            )
        ).scalars().all()
        return [
            {"name": h.name, "tel": None, "sido": h.sido, "sigungu": h.sigungu, "ykiho": h.ykiho}
            for h in rows
        ]

    if not HIRA_API_KEY:
        raise HTTPException(status_code=503, detail="심평원 API 키가 설정되지 않았습니다")
    try:
        resp = requests.get(
            HIRA_SEARCH_URL,
            params={"serviceKey": HIRA_API_KEY, "yadmNm": q, "numOfRows": "20", "pageNo": "1"},
            timeout=10,
        )
        root = ET.fromstring(resp.text)
    except Exception:
        raise HTTPException(status_code=502, detail="심평원 API 조회에 실패했습니다")

    result_code = root.findtext(".//resultCode")
    if result_code and result_code != "00":
        raise HTTPException(status_code=502, detail="심평원 API 오류: " + (root.findtext(".//resultMsg") or ""))

    results = []
    for item in root.findall(".//item"):
        results.append({
            "name": (item.findtext("yadmNm") or "").strip(),
            "tel": (item.findtext("telno") or "").strip() or None,
            "sido": (item.findtext("sidoCdNm") or "").strip(),
            "sigungu": (item.findtext("sgguCdNm") or "").strip(),
            "type": (item.findtext("clCdNm") or "").strip(),
            "ykiho": item.findtext("ykiho") or "",
        })
    return results


@router.get("/regions/sido")
async def get_sido_list(db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    q = select(Hospital.sido).where(Hospital.sido.is_not(None)).distinct().order_by(Hospital.sido)
    rows = (await db.execute(q)).scalars().all()
    return list(rows)


@router.get("/regions/sigungu")
async def get_sigungu_list(db: AsyncSession = Depends(get_db), sido: str = Query(...), user: User = Depends(require_staff)):
    q = (
        select(Hospital.sigungu)
        .where(Hospital.sido == sido, Hospital.sigungu.is_not(None))
        .distinct()
        .order_by(Hospital.sigungu)
    )
    rows = (await db.execute(q)).scalars().all()
    return list(rows)


def _origin(license_no: str | None, industry: str | None) -> str | None:
    """국산/수입. 허가번호 머리글자가 근거다 — 제허·제인·제신은 국내 제조 허가, 수허·수인·수신은 수입 허가.
    체외진단(체외…)·디지털의료기기(인2…·신2…)처럼 머리글자로 안 갈리는 번호만 식약처 업종(제조업/수입업)을 본다.
    국산 = '국내 제조업 허가'라는 뜻이다. 해외 위탁생산(제조국이 외국)일 수 있어 화면에 제조국을 같이 보여준다."""
    head = (license_no or "")[:1]
    if head == "제":
        return "국산"
    if head == "수":
        return "수입"
    if industry and "수입" in industry:
        return "수입"
    if industry and "제조" in industry:
        return "국산"
    return None


async def _license_info(db: AsyncSession, license_nos: set[str]) -> dict[str, dict]:
    """허가번호 → 식약처 품목허가 요약. equipment.license_no 와 mfds_device_items.license_no 는
    적재 때 같은 규칙(scripts/import_hira_equipment_full.norm_license)으로 정규화돼 있어 그대로 맞춘다.
    한 허가번호에 품목 행이 여럿(형명 여러 개)이면: 품목명은 가장 이른 허가 행, 제조원은 모아서,
    '취소·취하'는 모든 행이 취소·취하일 때만 단다."""
    out: dict[str, dict] = {}
    lics = sorted(license_nos)
    for i in range(0, len(lics), 500):  # SQLite 바인드변수 한도 대응
        rows = (await db.execute(
            select(
                MfdsDeviceItem.license_no, MfdsDeviceItem.item_name, MfdsDeviceItem.maker_name,
                MfdsDeviceItem.client_name, MfdsDeviceItem.nation, MfdsDeviceItem.permit_date,
                MfdsDeviceItem.revoked_code, MfdsDeviceItem.revoked_date, MfdsDeviceItem.industry,
            )
            .where(MfdsDeviceItem.license_no.in_(lics[i:i + 500]))
            .order_by(MfdsDeviceItem.license_no, MfdsDeviceItem.permit_date)
        )).all()
        for r in rows:
            d = out.get(r.license_no)
            if d is None:
                d = out[r.license_no] = {
                    "item_name": r.item_name, "origin": _origin(r.license_no, r.industry),
                    "makers": [], "client": r.client_name, "nation": r.nation,
                    "permit_date": r.permit_date, "revoked": True, "revoked_date": None,
                }
            if r.maker_name and r.maker_name not in d["makers"]:
                d["makers"].append(r.maker_name)
            if r.revoked_code:
                d["revoked_date"] = max(d["revoked_date"] or "", r.revoked_date or "") or None
            else:
                d["revoked"] = False
    for d in out.values():
        if not d["revoked"]:
            d["revoked_date"] = None
    return out


@router.get("/hospital/{hospital_id}")
async def get_hospital_detail(hospital_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    """병원 상세 — 지도 마커/카드 클릭 시 우측 패널에 표시. 카테고리별 연도별 보유장비 이력 포함."""
    h = (await db.execute(select(Hospital).where(Hospital.id == hospital_id))).scalar_one_or_none()
    if not h:
        return {"error": "not found"}

    # 필요한 칸만 읽는다 — 상급종합병원은 수천 행이라 ORM 객체를 통째로 만들면 그것만으로 느리다
    eq_rows = (
        await db.execute(
            select(
                Equipment.id, Equipment.hospital_id, Equipment.category, Equipment.category_name, Equipment.year,
                Equipment.model, Equipment.manufacturer, Equipment.brand, Equipment.eq_count, Equipment.source,
                Equipment.license_no,
            )
            .where(Equipment.hospital_id == hospital_id)
            .order_by(Equipment.category, Equipment.year.desc())
        )
    ).all()

    # 보유 기간(교체 시기) — 분류 최신 연도의 공공데이터 행에만 값이 붙고 나머지(이전 연도·수동 등록)는 None (app/tenure.py)
    tenure = await tenure_by_row_key(db, eq_rows)

    by_category: dict[str, dict[int, list[dict]]] = {}
    for e in eq_rows:
        by_category.setdefault(e.category, {}).setdefault(e.year, []).append({
            "id": e.id, "manufacturer": e.manufacturer, "model": e.model, "eq_count": e.eq_count, "source": e.source,
            "maker": _display_maker(e), "license_no": e.license_no,
            **tenure_fields(tenure.get((e.category, e.year, e.model)) if e.source != "manual" else None),
        })

    # 연도별 이력 탭은 영업지도 6분류뿐이다. 나머지 분류(심평원 전체 장비군)는 '전체' 보기에서
    # 최신 연도만 쓰므로 그 해만 보낸다 — 상급종합병원은 이것만으로 응답이 절반으로 준다.
    yearly_by_category = {
        cat: [{"year": y, "models": models, "total": sum(m["eq_count"] for m in models)}
              for y, models in sorted(years.items(), reverse=True)[: None if cat in MANUAL_CATEGORIES else 1]]
        for cat, years in by_category.items()
    }
    category_names = {e.category: e.category_name for e in eq_rows if e.category_name}
    sent_licenses = {
        m["license_no"] for yrs in yearly_by_category.values() for yr in yrs for m in yr["models"] if m["license_no"]
    }

    return {
        "hospital": {
            "id": h.id, "name": h.name, "type": h.type,
            "sido": h.sido, "sigungu": h.sigungu, "address": h.address,
            "lat": h.lat, "lng": h.lng,
            "is_member": h.hospital_profile_id is not None,
            "estb_date": h.estb_date,
        },
        "yearly_by_category": yearly_by_category,
        "category_names": category_names,
        "licenses": await _license_info(db, sent_licenses),
    }



def _display_maker(e) -> str | None:
    """화면에 보여줄 제조사. equipment.brand 가 전 행에 채워져 있으므로 그 칸이다
    (규칙은 app/brand_map.py, 채우는 곳은 scripts/apply_brand.py)."""
    return e.brand if e is not None else None


MANUAL_CATEGORIES = {"us", "xray", "ct", "mri", "bmd", "carm"}


class ManualEquipmentIn(BaseModel):
    hospital_id: int
    category: str  # us | xray | ct | mri | bmd | carm
    manufacturer: str
    model: str
    year: int
    eq_count: int = 1
    created_by: Optional[int] = None


@router.get("/equipment/catalog")
async def get_equipment_catalog(db: AsyncSession = Depends(get_db), category: str = "us", user: User = Depends(require_staff)):
    """수동 등록 시 제조사/장비 선택용 드롭다운 — 기존 임포트 데이터의 distinct 값 재사용."""
    q = (
        select(_brand_expr(), Equipment.model)
        .where(Equipment.category == category, Equipment.model.is_not(None))
        .distinct()
    )
    rows = (await db.execute(q)).all()
    return [{"manufacturer": r[0], "model": r[1]} for r in rows]


@router.post("/equipment/manual")
async def register_manual_equipment(payload: ManualEquipmentIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    """동물병원/2026 신규개원 등 공공데이터에 없는 병원의 장비를 직원이 직접 등록.
    등록 즉시 지도/병원정보에 매칭되도록 source='manual'로 저장."""
    # 심평원 전체 장비군 임포트 때 equipment.category의 CHECK 제약을 풀었으므로(195종이라),
    # 영업지도가 쓰는 6종은 여기서 막아준다 — 수동 등록 UI도 이 6개 탭뿐이다.
    if payload.category not in MANUAL_CATEGORIES:
        raise HTTPException(status_code=400, detail="알 수 없는 장비 분류입니다")
    eq = Equipment(
        hospital_id=payload.hospital_id,
        category=payload.category,
        year=payload.year,
        manufacturer=payload.manufacturer,
        # brand(표시용 제조사)는 쓰는 쪽에서 같이 채운다 — 비워 두면 화면에서 제조사가 사라진다
        brand=_display_of(payload.category, None, payload.manufacturer),
        model=payload.model,
        model_series=_compute_model_series(payload.model, "xr") if payload.category == "xray" else None,
        eq_count=payload.eq_count,
        source="manual",
        created_by=payload.created_by,
    )
    db.add(eq)
    await db.commit()
    await db.refresh(eq)
    return {"id": eq.id}


class ManualEquipmentUpdateIn(BaseModel):
    manufacturer: str
    model: str
    year: int
    eq_count: int = 1


@router.patch("/equipment/manual/{equipment_id}")
async def update_manual_equipment(equipment_id: int, payload: ManualEquipmentUpdateIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    """수동 등록된 장비만 추후 수정 가능 (source='manual'인 행만 허용, 공공데이터 임포트 행은 보호)."""
    eq = (await db.execute(select(Equipment).where(Equipment.id == equipment_id))).scalar_one_or_none()
    if not eq:
        raise HTTPException(status_code=404, detail="장비를 찾을 수 없습니다")
    if eq.source != "manual":
        raise HTTPException(status_code=403, detail="공공데이터로 임포트된 장비는 수정할 수 없습니다")
    eq.manufacturer = payload.manufacturer
    eq.brand = _display_of(eq.category, None, payload.manufacturer)
    eq.model = payload.model
    eq.model_series = _compute_model_series(payload.model, "xr") if eq.category == "xray" else None
    eq.year = payload.year
    eq.eq_count = payload.eq_count
    await db.commit()
    return {"id": eq.id}


@router.delete("/equipment/manual/{equipment_id}")
async def delete_manual_equipment(equipment_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    eq = (await db.execute(select(Equipment).where(Equipment.id == equipment_id))).scalar_one_or_none()
    if not eq:
        raise HTTPException(status_code=404, detail="장비를 찾을 수 없습니다")
    if eq.source != "manual":
        raise HTTPException(status_code=403, detail="공공데이터로 임포트된 장비는 삭제할 수 없습니다")
    await db.delete(eq)
    await db.commit()
    return {"ok": True}


# ────────────────────────────────────────────────────────
# 영업노트 — 병원별/날짜별/작성자별로 모아보기
# ────────────────────────────────────────────────────────
class SalesNoteIn(BaseModel):
    hospital_id: int
    visit_date: Optional[date] = None
    content: str


@router.post("/sales-notes")
async def create_sales_note(
    payload: SalesNoteIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)
):
    note = SalesNote(hospital_id=payload.hospital_id, user_id=user.id, visit_date=payload.visit_date, content=payload.content)
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return {"id": note.id}


@router.get("/sales-notes")
async def list_sales_notes(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    hospital_id: Optional[int] = None,
    user_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    q: Optional[str] = None,
    sort: str = "desc",
):
    """작성자 무관하게 전 직원의 영업노트를 모아본다(사내 전체 공유). q는 병원명/내용 검색어."""
    query = (
        select(SalesNote, Hospital.name, User.display_name)
        .join(Hospital, Hospital.id == SalesNote.hospital_id)
        .join(User, User.id == SalesNote.user_id)
    )
    if hospital_id:
        query = query.where(SalesNote.hospital_id == hospital_id)
    if user_id:
        query = query.where(SalesNote.user_id == user_id)
    if date_from:
        query = query.where(SalesNote.visit_date >= date_from)
    if date_to:
        query = query.where(SalesNote.visit_date <= date_to)
    if q:
        like = f"%{q}%"
        query = query.where(or_(SalesNote.content.ilike(like), Hospital.name.ilike(like)))
    order_col = SalesNote.visit_date.asc() if sort == "asc" else SalesNote.visit_date.desc()
    query = query.order_by(order_col)
    rows = (await db.execute(query)).all()
    return [
        {
            "id": n.id, "hospital_id": n.hospital_id, "hospital_name": hosp_name, "user_id": n.user_id,
            "author_name": author_name, "visit_date": n.visit_date, "content": n.content, "created_at": n.created_at,
        }
        for n, hosp_name, author_name in rows
    ]


class SalesNoteUpdateIn(BaseModel):
    visit_date: Optional[date] = None
    content: str


@router.patch("/sales-notes/{note_id}")
async def update_sales_note(
    note_id: int, payload: SalesNoteUpdateIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)
):
    """영업노트는 전 직원이 함께 보지만 수정/삭제는 작성자 본인만 가능."""
    note = (await db.execute(select(SalesNote).where(SalesNote.id == note_id))).scalar_one_or_none()
    if not note or note.user_id != user.id:
        raise HTTPException(status_code=404, detail="영업노트를 찾을 수 없습니다")
    note.visit_date = payload.visit_date
    note.content = payload.content
    await db.commit()
    return {"ok": True}


@router.delete("/sales-notes/{note_id}")
async def delete_sales_note(
    note_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)
):
    note = (await db.execute(select(SalesNote).where(SalesNote.id == note_id))).scalar_one_or_none()
    if not note or note.user_id != user.id:
        raise HTTPException(status_code=404, detail="영업노트를 찾을 수 없습니다")
    await db.delete(note)
    await db.commit()
    return {"ok": True}


# ────────────────────────────────────────────────────────
# 영업노트 탭의 개인 메모 — 제목 없이 내용만, 작성자 본인만 조회 가능
# ────────────────────────────────────────────────────────
class PersonalMemoIn(BaseModel):
    content: str


@router.get("/personal-memos")
async def list_personal_memos(db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    rows = (
        await db.execute(
            select(PersonalMemo).where(PersonalMemo.user_id == user.id).order_by(PersonalMemo.created_at.desc())
        )
    ).scalars().all()
    return [{"id": m.id, "content": m.content, "created_at": m.created_at} for m in rows]


@router.post("/personal-memos")
async def create_personal_memo(payload: PersonalMemoIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    memo = PersonalMemo(user_id=user.id, content=payload.content)
    db.add(memo)
    await db.commit()
    await db.refresh(memo)
    return {"id": memo.id}


@router.patch("/personal-memos/{memo_id}")
async def update_personal_memo(memo_id: int, payload: PersonalMemoIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    memo = (await db.execute(select(PersonalMemo).where(PersonalMemo.id == memo_id))).scalar_one_or_none()
    if not memo or memo.user_id != user.id:
        raise HTTPException(status_code=404, detail="메모를 찾을 수 없습니다")
    memo.content = payload.content
    await db.commit()
    return {"ok": True}


@router.delete("/personal-memos/{memo_id}")
async def delete_personal_memo(memo_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    memo = (await db.execute(select(PersonalMemo).where(PersonalMemo.id == memo_id))).scalar_one_or_none()
    if not memo or memo.user_id != user.id:
        raise HTTPException(status_code=404, detail="메모를 찾을 수 없습니다")
    await db.delete(memo)
    await db.commit()
    return {"ok": True}


# ────────────────────────────────────────────────────────
# 통계 — 제조사 매칭 기반, 영업지도와 동일 카테고리(us/xray/ct/mri) 사용
# ────────────────────────────────────────────────────────
@router.get("/stats/by-maker")
async def stats_by_maker(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    category: str = "us",
    year: int = 2025,
    sido: Optional[str] = None,
):
    q = (
        select(_brand_expr(), func.count(func.distinct(Equipment.hospital_id)))
        .join(Hospital, Hospital.id == Equipment.hospital_id)
        .where(Equipment.category == category, Equipment.year == year)
    )
    if sido:
        q = q.where(Hospital.sido == sido)
    q = q.group_by(_brand_expr())
    rows = (await db.execute(q)).all()
    return [{"maker": r[0] or "미상", "hospital_count": r[1]} for r in rows]
