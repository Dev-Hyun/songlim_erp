"""행정안전부 지방행정 인허가(개설·등록) 데이터 수집 — 의료기관 개설 현황용.

왜 필요한가: 심평원 병원정보서비스에는 **폐업·휴업 데이터가 없다.** 개설 현황을 제대로 만들려면
행안부 인허가 원장이 필요하다(메디하루도 같은 출처를 쓴다).

API: https://apis.data.go.kr/1741000/clinics/info  (의원·한의원·치과의원, 약 125,723건)
  - numOfRows는 요청값과 무관하게 **100으로 고정**된다 → 약 1,258페이지
  - 병원(/hospitals/info)은 서비스는 있으나 활용신청 전이라 403
    (SERVICE_KEY_IS_NOT_REGISTERED_ERROR, 2026-09-21 실측). data.go.kr 에서 이 오퍼레이션을
    활용신청하면(같은 서비스키 그대로 씀 — 새 키 발급 불필요) 신청되는 즉시 아래로 수집된다.
    신청되면 --category hospitals 로 코드 수정 없이 수집된다(OPENING_CATEGORIES 의
    '신규 병원' 탭은 이 category 로 행이 하나라도 생기면 자동으로 활성화된다 —
    med_stats._has_tab_rows 가 그때그때 확인하므로 프런트/백엔드 추가 배포가 필요 없다).

사용법:
  python backend/scripts/sync_localdata_clinics.py                    # 미리보기(1페이지)
  python backend/scripts/sync_localdata_clinics.py --apply            # 전체 수집
  python backend/scripts/sync_localdata_clinics.py --apply --resume   # 중단 지점부터 이어받기
  python backend/scripts/sync_localdata_clinics.py --apply --category hospitals

페이지 단위로 커밋하므로 중간에 끊겨도 --resume 으로 이어받는다. 멱등하다(mng_no UPSERT).
"""
import argparse
import os
import re
import shutil
import sqlite3
import sys
import time
from datetime import datetime, timezone

import requests

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BASE, "data.db")
PAGE_SIZE = 100  # 서버가 100으로 고정한다(더 크게 요청해도 100건만 온다)

# 인허가 원장의 시도 표기를 우리 hospitals 테이블 관례로 맞춘다.
# 광주는 이 프로젝트에서 전라남도로 통합했으므로 그 규칙을 깨지 않는다.
SIDO_CANON = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시", "인천": "인천광역시",
    "대전": "대전광역시", "울산": "울산광역시", "세종": "세종특별자치시",
    "광주": "전라남도", "광주광역시": "전라남도",
    "경기": "경기도", "강원": "강원특별자치도", "충북": "충청북도", "충남": "충청남도",
    "전북": "전북특별자치도", "전남": "전라남도", "경북": "경상북도", "경남": "경상남도",
    "제주": "제주특별자치도",
}

# 간판(기관명)에서 진료과를 뽑는 규칙. 행안부 원장의 진료과목 필드는 대부분 비어 있어
# 메디하루와 동일하게 기관명 문자열에서 파생한다.
# 순서가 중요하다 — '정형외과'가 '외과'보다 먼저 와야 '외과'로 잘못 잡히지 않는다.
DEPT_PATTERNS = [
    "정형외과", "성형외과", "신경외과", "흉부외과", "항문외과",
    "소아청소년과", "정신건강의학과", "마취통증의학과", "직업환경의학과",
    "진단검사의학과", "재활의학과", "영상의학과", "응급의학과", "가정의학과",
    "비뇨의학과", "비뇨기과", "이비인후과", "산부인과", "구강악안면외과", "치과교정과",
    "소아과", "정신과", "통증의학과", "핵의학과", "결핵과", "병리과",
    "내과", "외과", "안과", "피부과", "신경과", "치과", "한의원", "한방",
]


def derive_dept(name: str, subjects: str):
    """진료과 파생. 원장에 진료과목이 있으면 그걸 쓰고, 없으면 간판에서 뽑는다."""
    if subjects:
        first = subjects.split(",")[0].strip()
        if first:
            return first
    n = re.sub(r"\s+", "", name or "")
    for d in DEPT_PATTERNS:
        if d in n:
            return d
    return None


def parse_region(road_addr: str, lot_addr: str):
    """주소 앞부분에서 (시도, 시군구)를 뽑아 우리 표기로 정규화한다."""
    addr = (road_addr or lot_addr or "").strip()
    if not addr:
        return None, None
    parts = addr.split()
    if not parts:
        return None, None
    raw = parts[0]
    sido = SIDO_CANON.get(raw) or SIDO_CANON.get(raw[:2]) or raw
    sigungu = None
    if len(parts) > 1:
        sigungu = parts[1]
        # '수원시 팔달구' -> '수원팔달구' (기존 DB 관례에 맞춤)
        if sigungu.endswith("시") and len(parts) > 2 and parts[2].endswith("구"):
            sigungu = sigungu[:-1] + parts[2]
    return sido, sigungu


def load_key() -> str:
    env = os.path.join(BASE, ".env")
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            if line.startswith("HIRA_API_KEY"):
                return line.split("=", 1)[1].strip()
    return os.environ.get("HIRA_API_KEY", "")


def fetch(key: str, category: str, page: int):
    url = "https://apis.data.go.kr/1741000/" + category + "/info"
    r = requests.get(url, params={"serviceKey": key, "numOfRows": str(PAGE_SIZE),
                                  "pageNo": str(page), "type": "json"}, timeout=40)
    if r.status_code == 401 or "SERVICE_KEY_IS_NOT_REGISTERED" in r.text:
        raise PermissionError(category + " 데이터셋에 활용신청이 되어 있지 않습니다")
    r.raise_for_status()
    body = r.json()["response"]["body"]
    items = body.get("items") or {}
    rows = items.get("item") or []
    if isinstance(rows, dict):
        rows = [rows]
    return rows, int(body.get("totalCount") or 0)


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def to_row(x: dict, category: str) -> dict:
    name = (x.get("BPLC_NM") or "").strip()
    road = (x.get("ROAD_NM_ADDR") or "").strip()
    lot = (x.get("LOTNO_ADDR") or "").strip()
    sido, sigungu = parse_region(road, lot)
    subjects = (x.get("MDEXM_SBJCT_CN_NM") or "").strip()
    status = (x.get("SALS_STTS_NM") or "").strip()
    return {
        "mng_no": (x.get("MNG_NO") or "").strip(),
        "category": category,
        "name": name,
        "biz_type": (x.get("BZSTAT_SE_NM") or "").strip() or None,
        "opened_date": (x.get("LCPMT_YMD") or "").strip() or None,
        "closed_date": (x.get("CLSBIZ_YMD") or "").strip() or None,
        "revoked_date": (x.get("LCPMT_RTRCN_YMD") or "").strip() or None,
        "suspend_start": (x.get("TCBIZ_BGNG_YMD") or "").strip() or None,
        "suspend_end": (x.get("TCBIZ_END_YMD") or "").strip() or None,
        "status": status or None,
        "status_code": (x.get("SALS_STTS_CD") or "").strip() or None,
        "status_group": status or None,
        "detail_status": (x.get("DTL_SALS_STTS_NM") or "").strip() or None,
        "detail_status_code": (x.get("DTL_SALS_STTS_CD") or "").strip() or None,
        "road_addr": road or None,
        "lot_addr": lot or None,
        "sido": sido,
        "sigungu": sigungu,
        "subjects": subjects or None,
        "dept": derive_dept(name, subjects),
        "tel": (x.get("TELNO") or "").strip() or None,
        "coord_x": _f(x.get("CRD_INFO_X")),
        "coord_y": _f(x.get("CRD_INFO_Y")),
        "data_updated_at": (x.get("DAT_UPDT_PNT") or "").strip() or None,
    }


COLS = ["mng_no", "category", "name", "biz_type", "opened_date", "closed_date", "revoked_date",
        "suspend_start", "suspend_end", "status", "status_code", "status_group", "detail_status",
        "detail_status_code", "road_addr", "lot_addr", "sido", "sigungu", "subjects", "dept",
        "tel", "coord_x", "coord_y", "data_updated_at"]


def upsert(conn, rows):
    now = datetime.now(timezone.utc).isoformat()
    placeholders = ",".join(["?"] * len(COLS))
    updates = ",".join(c + "=excluded." + c for c in COLS if c != "mng_no")
    sql = ("INSERT INTO localdata_clinics (" + ",".join(COLS) + ",created_at,updated_at) "
           "VALUES (" + placeholders + ",?,?) "
           "ON CONFLICT(mng_no) DO UPDATE SET " + updates + ",updated_at=excluded.updated_at")
    payload = [[r[c] for c in COLS] + [now, now] for r in rows if r["mng_no"]]
    conn.executemany(sql, payload)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true", help="실제 수집 (기본은 1페이지 미리보기)")
    ap.add_argument("--category", default="clinics", help="clinics | hospitals")
    ap.add_argument("--resume", action="store_true", help="이미 받은 만큼 건너뛰고 이어받기")
    args = ap.parse_args()

    key = load_key()
    if not key:
        print("HIRA_API_KEY 를 찾을 수 없습니다 (backend/.env)")
        return 1

    conn = sqlite3.connect(args.db)
    try:
        rows, total = fetch(key, args.category, 1)
    except PermissionError as e:
        print("✗ " + str(e))
        return 2

    pages = (total + PAGE_SIZE - 1) // PAGE_SIZE
    have = conn.execute("SELECT COUNT(*) FROM localdata_clinics WHERE category = ?",
                        (args.category,)).fetchone()[0]
    print("DB: " + args.db)
    print("대상: {} · 전체 {:,}건 · {:,}페이지 · 이미 보유 {:,}건".format(
        args.category, total, pages, have))

    if not args.apply:
        print("")
        print("[미리보기] 1페이지 첫 3건:")
        for x in rows[:3]:
            r = to_row(x, args.category)
            print("   {} | {} | 개설 {} | {} | {} {} | 진료과 {}".format(
                r["name"], r["biz_type"], r["opened_date"], r["status"],
                r["sido"], r["sigungu"], r["dept"]))
        print("")
        print("실제 수집하려면 --apply 를 붙이세요.")
        return 0

    backup = args.db + ".bak_localdata_" + str(int(time.time()))
    shutil.copy2(args.db, backup)
    print("백업 생성: " + backup)

    start_page = (have // PAGE_SIZE) + 1 if (args.resume and have) else 1
    if start_page > 1:
        print("이어받기: {}페이지부터".format(start_page))

    t0 = time.time()
    got = 0
    for page in range(start_page, pages + 1):
        items = None
        for attempt in range(3):
            try:
                items, _ = fetch(key, args.category, page)
                break
            except Exception as e:
                if attempt == 2:
                    print("")
                    print("{}페이지 3회 실패: {}: {}".format(page, type(e).__name__, e))
                    print("--resume 으로 이어받을 수 있습니다 (현재까지 {:,}건)".format(got))
                    conn.commit()
                    return 1
                time.sleep(2)
        if not items:
            break
        upsert(conn, [to_row(x, args.category) for x in items])
        conn.commit()  # 페이지 단위 커밋 → 중단돼도 재개 가능
        got += len(items)
        if page % 20 == 0 or page == pages:
            sys.stdout.write("\r  {:,}/{:,} 페이지 · {:,}건 · {:.0f}초".format(
                page, pages, got, time.time() - t0))
            sys.stdout.flush()

    print("")
    n = conn.execute("SELECT COUNT(*) FROM localdata_clinics WHERE category = ?",
                     (args.category,)).fetchone()[0]
    print("완료. {} 보유 {:,}건".format(args.category, n))

    q_status = ("SELECT status, COUNT(*) FROM localdata_clinics WHERE category=? "
                "GROUP BY 1 ORDER BY 2 DESC")
    q_biz = ("SELECT biz_type, COUNT(*) FROM localdata_clinics WHERE category=? "
             "GROUP BY 1 ORDER BY 2 DESC LIMIT 6")
    for label, q in (("영업상태", q_status), ("업종", q_biz)):
        pairs = ["{}={:,}".format(k, v) for k, v in conn.execute(q, (args.category,))]
        print("  " + label + ": " + ", ".join(pairs))

    recent = conn.execute(
        "SELECT COUNT(*) FROM localdata_clinics WHERE category=? "
        "AND opened_date >= date('now','-30 day')", (args.category,)).fetchone()[0]
    print("  최근 30일 신규 개설: {:,}건".format(recent))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
