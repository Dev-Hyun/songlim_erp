"""영업지도 좌표 공백 메우기 — 심평원 XPos/YPos + 행안부 인허가(TM→WGS84).

왜 필요한가
----------
hospitals 89,295행 중 3,748행에 lat/lng가 없어 영업지도에 마커가 아예 안 찍힌다.
그중 3,507행은 ykiho가 없는 **레거시 장비 CSV 출신 행**(전부 장비 이력이 붙어 있다)이고,
241행은 ykiho는 있지만 좌표가 없는 행(217행이 동물병원)이다.

채우는 순서 (앞 단계에서 채워진 행은 뒷 단계로 넘어가지 않는다)
  A. 심평원 병원정보서비스 XPos/YPos — ykiho 조인.
  B. 행안부 인허가(localdata_clinics) — **이름 정규화 완전일치 + 시도 + 시군구 완전일치**,
     양쪽 모두 1:1일 때만.
  C. 도로명주소 동일 건물 — hospitals.address와 localdata_clinics.road_addr의
     '도로명 + 건물본번'이 같고 그 건물의 좌표가 유일할 때만.

좌표계 확정 근거 (실측)
----------------------
localdata_clinics.coord_x/coord_y는 TM 계열이다. 어느 EPSG인지는 추측하지 않고,
**이미 좌표를 가진 hospitals 행과 1:1로 떨어지는 67,007쌍**을 만들어 후보 좌표계마다
변환 후 거리를 재서 확정했다:

    EPSG:5174  중앙오차     3.7m · p90     22m · <100m 97.3%   <= 채택
    EPSG:2097  중앙오차   257.5m · p90    267m · <100m  0.1%
    EPSG:5181  중앙오차   315.3m · p90    323m · <100m  0.0%
    EPSG:5179  중앙오차 1,679km          (자릿수 자체가 다르다)

매칭 규칙별 정확도 (좌표를 이미 가진 행 전체를 정답으로 두고 실측)
    B 이름+시도+시군구   n=68,973  중앙   4m · <100m 97.3% · >1km 0.62%   <= 채택
    C 도로명 동일건물    n= 4,938  중앙   2m · <100m 97.2% · >1km 0.41%   <= 채택
      이름+시도만(완화) n=   966  중앙  12m · <100m 57.6% · >1km 41.1%   <= 기각
      이름 전국유일     n=   354  중앙 172km        · >1km 90.7%         <= 기각
    F 도로명 최근접번호  n= 6,654  중앙 100m · <500m 85.7% · >1km 6.7%    <= 기본 비활성
                                    (--road-approx 로 켤 수 있다)

F를 기본으로 켜지 않는 이유는 clear_bad_hospital_coords.py와 같은 판단이다 —
1km 어긋난 마커는 "없는 마커"보다 영업에 해롭다.

원칙
----
  * **lat/lng가 NULL인 행만** 채운다. 기존 좌표는 절대 덮어쓰지 않는다.
  * 한국 영역(위도 33~39, 경도 124~132) 밖이면 버린다.
  * hospitals_rtree는 AFTER UPDATE OF lat,lng 트리거가 자동으로 맞춘다.
  * 멱등 — 재실행하면 0건이 된다. --restore로 되돌릴 수 있다.

사용법
  python backend/scripts/fill_hospital_coords.py                 # dry-run
  python backend/scripts/fill_hospital_coords.py --apply         # 백업 뜨고 반영
  python backend/scripts/fill_hospital_coords.py --apply --road-approx
  python backend/scripts/fill_hospital_coords.py --restore       # 되돌리기
"""
import argparse
import collections
import json
import math
import os
import re
import shutil
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime

import requests
from pyproj import Transformer

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BASE, "data.db")
UNDO_PATH = os.path.join(BASE, "coord_fill_undo.json")
CACHE_DIR = os.path.join(BASE, "scripts", "_audit_cache")
HIRA_CACHE = os.path.join(CACHE_DIR, "hira_hosp_fresh.jsonl")
HIRA_URL = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList"

LOCALDATA_CRS = "EPSG:5174"   # 위 실측으로 확정
LAT_RANGE = (33.0, 39.0)
LNG_RANGE = (124.0, 132.0)

NAME_STRIP = re.compile(r"[\s()\[\]\"']")
ROAD_RE = re.compile(r"^(.*?\s\S*[로길])\s?(\d+)(?:-\d+)?")
# 행안부 원장의 시도 표기 -> 우리 hospitals 표기. 광주는 이 프로젝트에서 전라남도로 통합돼 있다.
SIDO_CANON = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시", "인천": "인천광역시",
    "대전": "대전광역시", "울산": "울산광역시", "세종": "세종특별자치시", "광주": "전라남도",
    "경기": "경기도", "강원": "강원특별자치도", "충북": "충청북도", "충남": "충청남도",
    "전북": "전북특별자치도", "전남": "전라남도", "경북": "경상북도", "경남": "경상남도",
    "제주": "제주특별자치도",
}


def norm_name(s):
    return NAME_STRIP.sub("", (s or "").lower())


def in_korea(lat, lng):
    return (lat is not None and lng is not None
            and LAT_RANGE[0] <= lat <= LAT_RANGE[1] and LNG_RANGE[0] <= lng <= LNG_RANGE[1])


def road_key(addr):
    """'경기도 김포시 걸포2로 21, 2층 203호 (걸포동)' -> ('경기도김포시걸포2로', 21)."""
    m = ROAD_RE.match((addr or "").replace(",", " "))
    return (re.sub(r"\s+", "", m.group(1)), int(m.group(2))) if m else None


def build_region_resolver(conn):
    """행안부 주소 -> (sido, sigungu)를 **우리 DB에 실재하는 표기로만** 돌려준다.

    매핑표를 고정하지 않고 hospitals에 있는 값에서 유도한다(normalize_hospital_region.py와 같은 방침).
    우리 DB 표기가 '대전서구'(광역시명 접두), '포항시 북구'(공백), '광주북구'처럼 제각각이라
    후보를 여러 개 만들어 실재하는 것을 고른다.
    """
    pool = collections.defaultdict(set)
    for sido, sgg in conn.execute(
        "SELECT DISTINCT sido, sigungu FROM hospitals WHERE sido IS NOT NULL AND sigungu IS NOT NULL"
    ):
        pool[sido].add(sgg)

    def resolve(addr):
        parts = (addr or "").split()
        if len(parts) < 2:
            return None, None
        head = parts[0]
        sido = SIDO_CANON.get(head) or SIDO_CANON.get(head[:2]) or head
        names = pool.get(sido)
        if not names:
            return sido, None
        sgg = parts[1]
        cands = []
        if len(parts) > 2 and sgg.endswith("시") and parts[2].endswith("구"):
            cands += [sgg[:-1] + parts[2], sgg + " " + parts[2], sgg[:-1] + " " + parts[2]]
        cands += [sgg, head[:2] + sgg]
        for c in cands:
            if c in names:
                return sido, c
        tail = [p for p in names if p.endswith(sgg) and len(p) > len(sgg)]
        if len(tail) == 1:          # '북구' -> '광주북구' 처럼 시도 안에서 유일할 때만
            return sido, tail[0]
        if sido == "세종특별자치시" and "세종시" in names:  # 세종은 시군구 계층이 없다
            return sido, "세종시"
        return sido, None

    return resolve


# --------------------------------------------------------------------------- 심평원
def load_key():
    env = os.path.join(BASE, ".env")
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            if line.startswith("HIRA_API_KEY"):
                return line.split("=", 1)[1].strip()
    return os.environ.get("HIRA_API_KEY", "")


def fetch_hira(cache):
    """{ykiho: (lat, lng)}. 캐시가 있으면 재사용, 없으면 전체 수신 후 캐시에 쓴다."""
    if not os.path.exists(cache):
        key = load_key()
        if not key:
            print("HIRA_API_KEY 없음 — 심평원 단계를 건너뜁니다.")
            return {}
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        page, n = 1, 0
        with open(cache, "w", encoding="utf-8") as f:
            while True:
                r = requests.get(HIRA_URL, params={"serviceKey": key, "numOfRows": "1000",
                                                   "pageNo": str(page)}, timeout=60)
                r.raise_for_status()
                root = ET.fromstring(r.text)
                items = root.findall(".//item")
                if not items:
                    break
                for it in items:
                    d = {k: (it.findtext(k) or "").strip()
                         for k in ("ykiho", "yadmNm", "clCdNm", "sidoCdNm", "sgguCdNm",
                                   "addr", "estbDd", "telno", "XPos", "YPos")}
                    if d["ykiho"]:
                        f.write(json.dumps(d, ensure_ascii=False) + "\n")
                        n += 1
                total = int(root.findtext(".//totalCount") or 0)
                sys.stdout.write("\r  심평원 수신 {:,}건".format(n))
                sys.stdout.flush()
                if total and page * 1000 >= total:
                    break
                page += 1
        print()
    out = {}
    for line in open(cache, encoding="utf-8"):
        d = json.loads(line)
        try:
            lat, lng = float(d["YPos"]), float(d["XPos"])
        except (TypeError, ValueError):
            continue
        if in_korea(lat, lng):
            out[d["ykiho"]] = (lat, lng)
    return out


# --------------------------------------------------------------------------- 행안부
def build_localdata_index(conn, resolve):
    """(이름키 -> 좌표집합, 건물키 -> 좌표집합, 도로명 -> [(본번, 좌표)])."""
    tr = Transformer.from_crs(LOCALDATA_CRS, "EPSG:4326", always_xy=True)
    by_name = collections.defaultdict(set)
    by_bld = collections.defaultdict(set)
    by_road = collections.defaultdict(list)
    total = kept = 0
    for name, road, lot, x, y in conn.execute(
        "SELECT name, road_addr, lot_addr, coord_x, coord_y FROM localdata_clinics "
        "WHERE coord_x IS NOT NULL AND coord_y IS NOT NULL"
    ):
        total += 1
        lng, lat = tr.transform(x, y)
        if not (math.isfinite(lat) and math.isfinite(lng)) or not in_korea(lat, lng):
            continue
        kept += 1
        pt = (round(lat, 6), round(lng, 6))
        sido, sgg = resolve(road or lot)
        if sgg:
            by_name[(norm_name(name), sido, sgg)].add(pt)
        rk = road_key(road)
        if rk:
            by_bld[rk].add(pt)
            by_road[rk[0]].append((rk[1], pt))
    print("행안부 좌표보유 {:,}건 · {}→WGS84 변환 후 한국영역 {:,}건 ({:.1%}) · "
          "이름키 {:,} · 건물키 {:,}".format(total, LOCALDATA_CRS, kept, kept / total,
                                             len(by_name), len(by_bld)))
    return by_name, by_bld, by_road


# --------------------------------------------------------------------------- 본체
def plan(conn, use_road_approx):
    resolve = build_region_resolver(conn)
    hira = fetch_hira(HIRA_CACHE)
    print("심평원 유효좌표 {:,}건".format(len(hira)))
    by_name, by_bld, by_road = build_localdata_index(conn, resolve)

    # 우리 쪽 동명 중복 방지 — 같은 (이름, 시도, 시군구)가 2행 이상이면 매칭하지 않는다
    dup = collections.Counter()
    for nn, s, g in conn.execute(
        "SELECT name_norm, sido, sigungu FROM hospitals WHERE sigungu IS NOT NULL"
    ):
        dup[(nn, s, g)] += 1

    targets = list(conn.execute(
        "SELECT id, name, name_norm, type, sido, sigungu, address, ykiho FROM hospitals "
        "WHERE lat IS NULL OR lng IS NULL ORDER BY id"))
    fills, skipped = [], collections.Counter()
    for hid, name, nn, typ, sido, sgg, addr, ykiho in targets:
        pt = hira.get(ykiho) if ykiho else None
        if pt:
            fills.append((hid, name, typ, pt[0], pt[1], "A_심평원"))
            continue
        key = (nn, sido, sgg)
        if sgg and dup[key] == 1:
            v = by_name.get(key)
            if v and len(v) == 1:
                lat, lng = next(iter(v))
                fills.append((hid, name, typ, lat, lng, "B_행안부이름지역"))
                continue
            if v:
                skipped["행안부 동일이름에 좌표 2개 이상"] += 1
        elif sgg:
            skipped["우리 DB에 동명동지역 행이 2개 이상"] += 1
        rk = road_key(addr)
        if rk:
            v = by_bld.get(rk)
            if v and len(v) == 1:
                lat, lng = next(iter(v))
                fills.append((hid, name, typ, lat, lng, "C_도로명동일건물"))
                continue
            if use_road_approx and by_road.get(rk[0]):
                _num, pt = min(by_road[rk[0]], key=lambda t: abs(t[0] - rk[1]))
                fills.append((hid, name, typ, pt[0], pt[1], "F_도로명근사"))
                continue
        skipped["행안부 원장에 없음(주소도 없음)" if not addr else "행안부 원장에 없음"] += 1

    fills = [f for f in fills if in_korea(f[3], f[4])]   # 한국 영역 밖은 버린다
    return targets, fills, skipped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true", help="실제 반영 (기본은 dry-run)")
    ap.add_argument("--restore", action="store_true", help="이 스크립트가 채운 좌표를 NULL로 되돌린다")
    ap.add_argument("--road-approx", action="store_true",
                    help="도로명 최근접 건물번호 근사까지 채운다 (중앙오차 100m, 1km 초과 6.7%%)")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    conn = sqlite3.connect(args.db)

    if args.restore:
        if not os.path.exists(UNDO_PATH):
            print("되돌릴 기록이 없습니다: " + UNDO_PATH)
            return 1
        rows = json.load(open(UNDO_PATH, encoding="utf-8"))
        n = 0
        for r in rows:
            cur = conn.execute("SELECT lat, lng FROM hospitals WHERE id = ?", (r["id"],)).fetchone()
            if cur and cur[0] is not None and abs(cur[0] - r["lat"]) < 1e-6:
                conn.execute("UPDATE hospitals SET lat = NULL, lng = NULL WHERE id = ?", (r["id"],))
                n += 1
        conn.commit()
        print("{:,}행을 NULL로 되돌렸습니다 (총 기록 {:,}행).".format(n, len(rows)))
        return 0

    before = conn.execute("SELECT COUNT(*) FROM hospitals WHERE lat IS NULL OR lng IS NULL").fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM hospitals").fetchone()[0]
    print("DB: {}\nhospitals {:,}행 · 좌표 없음 {:,}행 ({:.2%})\n".format(
        args.db, total, before, before / total))

    targets, fills, skipped = plan(conn, args.road_approx)
    per = collections.Counter(f[5] for f in fills)
    print("\n대상 {:,}행 중 채울 수 있는 것 {:,}행".format(len(targets), len(fills)))
    for k, v in sorted(per.items()):
        print("  {:20s} {:,}".format(k, v))
    print("채우지 못하는 사유:")
    for k, v in skipped.most_common():
        print("  {:34s} {:,}".format(k, v))
    rest = collections.Counter(t[3] for t in targets) - collections.Counter(f[2] for f in fills)
    print("남는 행 종별: " + ", ".join("{} {:,}".format(k, v) for k, v in rest.most_common()))

    if not args.apply:
        print("\n[dry-run] 반영하려면 --apply 를 붙이세요. 반영 후 좌표 없음: {:,}행 ({:.2%})".format(
            before - len(fills), (before - len(fills)) / total))
        return 0

    backup = "{}.bak_coordfill_{}".format(args.db, int(time.time()))
    shutil.copy2(args.db, backup)
    print("\n백업 생성: " + backup)

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn.executemany(
        "UPDATE hospitals SET lat = ?, lng = ?, updated_at = ? "
        "WHERE id = ? AND (lat IS NULL OR lng IS NULL)",   # 멱등 + 기존 좌표 보호
        [(f[3], f[4], now, f[0]) for f in fills],
    )
    conn.commit()
    json.dump([{"id": f[0], "name": f[1], "lat": f[3], "lng": f[4], "src": f[5]} for f in fills],
              open(UNDO_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("되돌리기 기록: " + UNDO_PATH)

    after = conn.execute("SELECT COUNT(*) FROM hospitals WHERE lat IS NULL OR lng IS NULL").fetchone()[0]
    bad = conn.execute("SELECT COUNT(*) FROM hospitals WHERE lat IS NOT NULL AND "
                       "(lat < 33 OR lat > 39 OR lng < 124 OR lng > 132)").fetchone()[0]
    rtree = conn.execute("SELECT COUNT(*) FROM hospitals_rtree").fetchone()[0]
    have = conn.execute("SELECT COUNT(*) FROM hospitals WHERE lat IS NOT NULL AND lng IS NOT NULL").fetchone()[0]
    print("\n좌표 없음 {:,} -> {:,}행 · 커버리지 {:.2%}".format(before, after, (total - after) / total))
    print("한국 밖 좌표 {}행(0이어야 정상) · rtree {:,} = 좌표보유 {:,} ({})".format(
        bad, rtree, have, "일치" if rtree == have else "불일치!"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
