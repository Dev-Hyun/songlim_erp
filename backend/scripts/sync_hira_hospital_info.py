"""심평원 병원정보서비스로 hospitals 테이블을 채운다 — 개설일자·주소·좌표 + **누락 기관 신규 삽입**.

왜 필요한가:
  - 개설일자(estbDd)가 DB에 없어서 '의료기관 개설 현황' 화면이 연 단위 프록시로만 돌고 있었다.
  - hospitals 자체가 **장비 CSV에서 만들어진 테이블**이라, 장비를 한 번도 신고하지 않은 기관
    (의원·치과의원·한의원 다수, 보건지소 등)이 통째로 빠져 있다. 그래서 최근 개설 기관이
    거의 안 들어와 있었다 — 2026-06 개설 175곳 중 DB에 7곳뿐이었다.
    실측: 심평원 전체 79,861 vs 우리 ykiho 61,203, 겹치는 건 55,140.

처리:
  1) ykiho가 이미 있으면 **갱신만** 한다 (개설일자·시도·시군구·종별은 다르면 갱신,
     주소/좌표는 비어 있을 때만).
  2) ykiho가 없으면 **신규 삽입**한다. 표기는 전부 우리 DB 관례로 변환한다(아래).
  3) 이름·시군구가 같은데 우리 쪽 ykiho가 심평원 전체 목록에서 사라진 행은 **요양기호 재발급**으로
     보고 새 행을 만드는 대신 기존 행의 ykiho를 갈아끼운다(1:1로 떨어질 때만). 지도에 같은 병원이
     두 개 찍히는 걸 막고, 그 행에 딸린 장비 이력을 유지하기 위함이다.
  **기존 행은 절대 삭제하지 않는다.**

  시도·시군구·종별을 갱신하는 이유 (2026-09-20 추가 — 데이터 교차검증 보고서 R12):
    예전에는 이 셋을 손대지 않아서, 기관이 이사하면 주소·좌표만 새 값이 되고 지역 칸은 옛 값으로
    남아 **2,006행이 자기 주소와 모순**되는 상태였다(보고서 E1). 영업지도와 통계는 sido/sigungu로
    필터링하므로 그 병원들이 엉뚱한 지역 목록에 잡혔고, clear_bad_hospital_coords.py가 그 지역 칸을
    정답으로 믿고 **멀쩡한 좌표 281건을 지우는** 2차 피해까지 냈다(E2). 매 동기화마다 심평원 값으로
    맞춰 두면 재발하지 않는다.
    **기관명(name)은 갱신하지 않는다** — 영업노트·거래처가 옛 이름으로 붙어 있을 수 있어
    자동으로 덮어쓰면 위험하다(보고서 R5는 1회성 수동 반영).

표기 변환 (기존 데이터를 조회해 맞춘 것):
  - sido    : 심평원 '경기' -> '경기도'. 심평원은 광주·전남을 '전남광주'로 합쳐서 주므로 그대로
              '전라남도'로 간다 (우리 DB도 광주를 전남에 통합해 뒀다 — sido='광주광역시'는 0행이어야 한다).
  - sigungu : 심평원 표기('수원팔달구')를 그대로 쓰되, 우리 DB가 다른 표기를 쓰는 곳은 DB 쪽으로
              맞춘다. 매핑표를 고정하지 않고 **DB에 실재하는 값에서 유도**한다
              (예: 심평원 '포항북구' -> DB '포항시 북구'). normalize_hospital_region.py와 같은 접기 규칙.
  - type    : 심평원 clCdNm 그대로. '상급종합'만 DB 관례인 '상급종합병원'으로 바꾼다.
  - name_norm: 소문자화 + 공백/괄호/대괄호/따옴표 제거 (기존 64,710행 전부와 일치함을 확인).
  - 좌표    : 한국 영역(위도 33~39, 경도 124~132) 밖이면 버린다.

안전장치: dry-run 기본, --apply 시 백업 자동 생성. 멱등 — 재실행하면 삽입 0건이 된다.

사용법:
  python backend/scripts/sync_hira_hospital_info.py --pages 3          # 3페이지만 dry-run
  python backend/scripts/sync_hira_hospital_info.py --apply            # 전체 반영
  python backend/scripts/sync_hira_hospital_info.py --apply --overwrite-coords
"""
import argparse
import collections
import os
import re
import sqlite3
import shutil
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime

import requests

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BASE, "data.db")
URL = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList"
PAGE_SIZE = 1000

# 심평원 sidoCdNm -> 우리 DB sido. '전남광주'는 심평원이 이미 광주를 전남에 합쳐서 주는 표기다.
SIDO_MAP = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시", "인천": "인천광역시",
    "대전": "대전광역시", "울산": "울산광역시", "세종시": "세종특별자치시", "경기": "경기도",
    "강원": "강원특별자치도", "충북": "충청북도", "충남": "충청남도", "전북": "전북특별자치도",
    "경북": "경상북도", "경남": "경상남도", "제주": "제주특별자치도",
    # 광주는 전남으로 통합돼 있다 (merge_gwangju_into_jeonnam.py). 두 표기 모두 전남으로.
    "전남광주": "전라남도", "전남": "전라남도", "광주": "전라남도",
}
CL_MAP = {"상급종합": "상급종합병원"}  # 나머지 clCdNm은 우리 DB type과 표기가 같다

NAME_NORM_STRIP = re.compile(r"[\s()\[\]\"']")
LAT_RANGE = (33.0, 39.0)
LNG_RANGE = (124.0, 132.0)


def load_key() -> str:
    env = os.path.join(BASE, ".env")
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            if line.startswith("HIRA_API_KEY"):
                return line.split("=", 1)[1].strip()
    return os.environ.get("HIRA_API_KEY", "")


def norm_name(name: str) -> str:
    return NAME_NORM_STRIP.sub("", name.lower())


def collapse(sigungu: str) -> str:
    """'포항시 북구' -> '포항북구'. normalize_hospital_region.py와 같은 접기 규칙."""
    return re.sub(r"시\s+(?=\S+구$)", "", sigungu).replace(" ", "")


def build_sigungu_map(conn: sqlite3.Connection) -> dict[tuple[str, str], str]:
    """(sido, 접은표기) -> DB에서 실제로 쓰는 표기. 같은 곳이 여러 표기면 최다행 표기가 이긴다."""
    per = collections.defaultdict(collections.Counter)
    for sido, sgg, n in conn.execute(
        "SELECT sido, sigungu, COUNT(*) FROM hospitals "
        "WHERE sido IS NOT NULL AND sigungu IS NOT NULL GROUP BY 1, 2"
    ):
        per[(sido, collapse(sgg))][sgg] += n
    return {k: c.most_common(1)[0][0] for k, c in per.items()}


def to_iso(estb: str) -> str | None:
    """'19670523' -> '1967-05-23'. 형식이 어긋나면 버린다."""
    estb = (estb or "").strip()
    if len(estb) != 8 or not estb.isdigit():
        return None
    y, m, d = estb[:4], estb[4:6], estb[6:]
    if not ("1900" <= y <= "2100" and "01" <= m <= "12" and "01" <= d <= "31"):
        return None
    return f"{y}-{m}-{d}"


def fetch_page(key: str, page: int) -> tuple[list[dict], int]:
    r = requests.get(URL, params={"serviceKey": key, "numOfRows": str(PAGE_SIZE),
                                  "pageNo": str(page)}, timeout=30)
    r.raise_for_status()
    root = ET.fromstring(r.text)
    code = root.findtext(".//resultCode")
    if code and code != "00":
        raise RuntimeError(f"심평원 API 오류 {code}: {root.findtext('.//resultMsg')}")
    total = int(root.findtext(".//totalCount") or 0)
    out = []
    for it in root.findall(".//item"):
        ykiho = (it.findtext("ykiho") or "").strip()
        if not ykiho:
            continue
        out.append({
            "ykiho": ykiho,
            "name": (it.findtext("yadmNm") or "").strip(),
            "type": (it.findtext("clCdNm") or "").strip(),
            "sido_raw": (it.findtext("sidoCdNm") or "").strip(),
            "sggu_raw": (it.findtext("sgguCdNm") or "").strip(),
            "estb": to_iso(it.findtext("estbDd") or ""),
            "addr": (it.findtext("addr") or "").strip() or None,
            "lng": it.findtext("XPos"),
            "lat": it.findtext("YPos"),
        })
    return out, total


def coords(item: dict) -> tuple[float | None, float | None]:
    """한국 영역 밖이거나 파싱 실패면 (None, None)."""
    try:
        lat, lng = float(item["lat"]), float(item["lng"])
    except (TypeError, ValueError):
        return None, None
    if LAT_RANGE[0] <= lat <= LAT_RANGE[1] and LNG_RANGE[0] <= lng <= LNG_RANGE[1]:
        return lat, lng
    return None, None


def fetch_all(key: str, max_pages: int) -> tuple[list[dict], bool]:
    """전체(또는 max_pages까지) 수신. 두 번째 값은 '끝까지 받았는가'."""
    items, page, total = [], 1, None
    complete = True
    while True:
        try:
            got, total = fetch_page(key, page)
        except Exception as e:
            print(f"\n{page}페이지 실패: {type(e).__name__}: {e}")
            complete = False
            break
        if not got:
            break
        items.extend(got)
        pages_total = (total + PAGE_SIZE - 1) // PAGE_SIZE if total else page
        sys.stdout.write(f"\r  수신 {page}/{pages_total} 페이지 · {len(items):,}건")
        sys.stdout.flush()
        if max_pages and page >= max_pages:
            complete = False
            break
        if total and page * PAGE_SIZE >= total:
            break
        page += 1
    print()
    return items, complete


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true", help="실제 반영 (기본은 dry-run)")
    ap.add_argument("--pages", type=int, default=0, help="가져올 페이지 수 제한 (0=전체)")
    ap.add_argument("--overwrite-coords", action="store_true",
                    help="기존 좌표도 API 값으로 덮어쓴다 (좌표 오류 정정용)")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    key = load_key()
    if not key:
        print("HIRA_API_KEY 를 찾을 수 없습니다 (backend/.env 확인)")
        return 1

    conn = sqlite3.connect(args.db)
    known = {r[0]: r[1:] for r in conn.execute(
        "SELECT ykiho, estb_date, address, lat, lng, sido, sigungu, type "
        "FROM hospitals WHERE ykiho IS NOT NULL")}
    sggu_map = build_sigungu_map(conn)
    print(f"DB: {args.db}\nykiho 보유 행: {len(known):,}")

    items, complete = fetch_all(key, args.pages)
    if not items:
        print("수신 0건 — 중단합니다.")
        return 1
    print(f"수신 합계: {len(items):,}건 (전체수신={complete})")

    # --- 요양기호 재발급 후보: 이름·시군구가 같은데 우리 쪽 ykiho가 현재 목록에 없는 행 ---
    # 부분 수신(--pages)일 때는 '사라진 ykiho' 판정이 불가능하므로 건너뛴다.
    rekey: dict[str, int] = {}  # 새 ykiho -> 갈아끼울 hospital id
    if complete:
        api_yk = {it["ykiho"] for it in items}
        dead = collections.defaultdict(list)
        for hid, nn, sgg, yk in conn.execute(
            "SELECT id, name_norm, sigungu, ykiho FROM hospitals WHERE ykiho IS NOT NULL"
        ):
            if yk not in api_yk:
                dead[(nn, sgg)].append(hid)
        cand = collections.defaultdict(list)
        for it in items:
            if it["ykiho"] in known:
                continue
            sido = SIDO_MAP.get(it["sido_raw"])
            sgg = sggu_map.get((sido, collapse(it["sggu_raw"])), it["sggu_raw"])
            k = (norm_name(it["name"]), sgg)
            if k in dead:
                cand[k].append(it["ykiho"])
        for k, yks in cand.items():
            if len(yks) == 1 and len(dead[k]) == 1:  # 1:1로 떨어질 때만 — 동명 기관 오합침 방지
                rekey[yks[0]] = dead[k][0]
        print(f"요양기호 재발급으로 보이는 1:1 매칭: {len(rekey):,}건 (신규 삽입 대신 기존 행 갱신)")

    if args.apply:
        backup = f"{args.db}.bak_hira_sync_{int(time.time())}"
        shutil.copy2(args.db, backup)
        print(f"백업 생성: {backup}")

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    n_estb = n_addr = n_coord = n_new = n_rekey = n_region = n_type = 0
    bad_sido: collections.Counter = collections.Counter()
    new_rows: list[tuple] = []

    for it in items:
        cur = known.get(it["ykiho"])
        lat, lng = coords(it)

        if cur is None and it["ykiho"] not in rekey:
            # --- 신규 삽입 ---
            sido = SIDO_MAP.get(it["sido_raw"])
            if sido is None:
                bad_sido[it["sido_raw"]] += 1
                continue
            sgg = sggu_map.get((sido, collapse(it["sggu_raw"])), it["sggu_raw"])
            new_rows.append((
                it["name"], norm_name(it["name"]), CL_MAP.get(it["type"], it["type"]) or None,
                sido, sgg, it["addr"], lat, lng, it["ykiho"], now, now, it["estb"],
            ))
            n_new += 1
            continue

        if cur is None:
            # --- 재발급: 기존 행의 ykiho를 갈아끼우고 최신 값으로 갱신 ---
            hid = rekey[it["ykiho"]]
            if args.apply:
                conn.execute(
                    "UPDATE hospitals SET ykiho = ?, estb_date = COALESCE(?, estb_date), "
                    "address = COALESCE(address, ?), "
                    "lat = COALESCE(lat, ?), lng = COALESCE(lng, ?), updated_at = ? WHERE id = ?",
                    (it["ykiho"], it["estb"], it["addr"], lat, lng, now, hid),
                )
            n_rekey += 1
            continue

        # --- 기존 행 갱신 ---
        cur_estb, cur_addr, cur_lat, cur_lng, cur_sido, cur_sgg, cur_type = cur
        sets, vals = [], []
        if it["estb"] and it["estb"] != cur_estb:
            sets.append("estb_date = ?"); vals.append(it["estb"]); n_estb += 1
        if it["addr"] and not cur_addr:
            sets.append("address = ?"); vals.append(it["addr"]); n_addr += 1
        if lat and lng and (args.overwrite_coords or cur_lat is None or cur_lng is None):
            sets.append("lat = ?"); vals.append(lat)
            sets.append("lng = ?"); vals.append(lng)
            n_coord += 1

        # 지역·종별은 이사/재분류를 따라가야 한다 (R12). 시도가 바뀌면 시군구도 새 시도 기준으로.
        sido = SIDO_MAP.get(it["sido_raw"])
        if sido:
            sgg = sggu_map.get((sido, collapse(it["sggu_raw"])), it["sggu_raw"])
            if sido != cur_sido:
                sets.append("sido = ?"); vals.append(sido); n_region += 1
                if sgg and sgg != cur_sgg:
                    sets.append("sigungu = ?"); vals.append(sgg)
            elif sgg and cur_sgg and sgg != cur_sgg:
                sets.append("sigungu = ?"); vals.append(sgg); n_region += 1
        atype = CL_MAP.get(it["type"], it["type"])
        if atype and atype != cur_type:
            sets.append("type = ?"); vals.append(atype); n_type += 1

        if sets and args.apply:
            vals.append(it["ykiho"])
            conn.execute(f"UPDATE hospitals SET {', '.join(sets)} WHERE ykiho = ?", vals)

    if bad_sido:
        print(f"시도 표기를 모르는 행 {sum(bad_sido.values()):,}건 건너뜀: {dict(bad_sido)}")

    if args.apply and new_rows:
        # 대량 INSERT는 한 번에 — 행마다 커밋하면 몇 시간 걸린다
        conn.executemany(
            "INSERT INTO hospitals (name, name_norm, type, sido, sigungu, address, lat, lng, "
            "ykiho, created_at, updated_at, estb_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            new_rows,
        )

    print(f"\n신규 삽입 {n_new:,} · 요양기호 재발급 갱신 {n_rekey:,} · "
          f"개설일자 {n_estb:,} · 주소 {n_addr:,} · 좌표 {n_coord:,}")

    if not args.apply:
        print("[dry-run] 실제 반영하려면 --apply 를 붙이세요.")
        return 0

    conn.commit()
    conn.execute("ANALYZE")
    conn.commit()
    report(conn)
    return 0


def report(conn: sqlite3.Connection) -> None:
    total = conn.execute("SELECT COUNT(*) FROM hospitals").fetchone()[0]
    filled = conn.execute("SELECT COUNT(*) FROM hospitals WHERE estb_date IS NOT NULL").fetchone()[0]
    gwangju = conn.execute("SELECT COUNT(*) FROM hospitals WHERE sido = '광주광역시'").fetchone()[0]
    nullsido = conn.execute("SELECT COUNT(*) FROM hospitals WHERE sido IS NULL").fetchone()[0]
    badcoord = conn.execute(
        "SELECT COUNT(*) FROM hospitals WHERE lat IS NOT NULL "
        "AND (lat < 33 OR lat > 39 OR lng < 124 OR lng > 132)").fetchone()[0]
    print(f"\nhospitals 총 {total:,}행 · estb_date 보유 {filled:,}행")
    print(f"sido='광주광역시' 잔여 {gwangju}행(0이어야 정상) · sido NULL {nullsido}행 · "
          f"한국 밖 좌표 {badcoord}행(0이어야 정상)")
    print("2026년 월별 개설:")
    for m, n in conn.execute(
        "SELECT substr(estb_date, 1, 7), COUNT(*) FROM hospitals "
        "WHERE estb_date LIKE '2026%' GROUP BY 1 ORDER BY 1"
    ):
        print(f"  {m}  {n:,}")


if __name__ == "__main__":
    raise SystemExit(main())
