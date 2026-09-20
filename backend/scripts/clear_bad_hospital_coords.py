"""영업지도: 주소(시도/시군구)와 명백히 어긋난 좌표를 지도에서 제외한다 (재실행 가능).

배경
----
hospitals 중 일부는 지오코딩이 다른 병원 좌표로 잘못 붙어서, 서울 병원 마커가 제주에,
부산 병원 마커가 강원도에 찍힌다. 영업지도에서 이건 단순한 오차가 아니라 "가면 없는 주소"라
잘못된 마커를 그리느니 마커를 안 그리는 편이 낫다.

이 행들은 전부 심평원 임포트 건이라 address 컬럼이 비어 있어 좌표를 다시 계산할 근거가 없다.
따라서 lat/lng를 NULL로 만들어 지도에서 빠지게 하고(병원명/지역 검색 목록에는 그대로 남는다),
원래 값은 되돌리기용 JSON에 보관한다.

판정 기준 (넷을 모두 만족할 때만 — 섬이 흩어진 옹진군/신안군 같은 정상 케이스 오탐 방지)
  1) 자기 시군구 클러스터 중앙좌표에서 50km 초과
  2) 그 거리가 해당 시군구 클러스터 p90 거리의 2배 초과
  3) 가장 가까운 **다른 시군구**의 중앙좌표가 자기 구역 거리의 1/3 이내
     (= 좌표가 엉뚱한 지역 한복판에 찍혀 있다. 같은 시도 안에서 평택->파주처럼
      어긋난 건도 잡으려면 시도가 아니라 시군구 기준이어야 한다)
  4) **address가 좌표 쪽 지역을 가리키지 않을 것** (아래 참고)

  1)의 50km 문턱은 낮추지 않는다. 더 낮추면 '부천시'(구 미상) vs '부천원미구'처럼
  granularity만 다른 정상 행이나 강남/서초 경계 건물이 오탐으로 걸린다.

기준 4를 2026-09-20에 추가한 이유 (데이터 교차검증 보고서 E2)
-------------------------------------------------------------
이 스크립트는 처음에 1~3만 보고 305행의 좌표를 지웠는데, 심평원 원본과 대조해 보니
**그중 281행(92%)은 좌표가 정확했다**(심평원 좌표와 0m). 틀린 것은 좌표가 아니라
`sido`/`sigungu` 쪽이었다 — 병원이 이사했는데 지역 칸만 옛 값으로 남아 있었던 것이다.
기준 1~3은 지역 칸을 정답으로 믿고 좌표를 의심하는데, 실제로는 반대였다.

그래서 지우기 전에 그 행의 `address`를 본다. 주소가 **좌표가 찍힌 지역**을 가리키면
좌표가 맞고 지역 칸이 낡은 것이므로 **좌표를 지우지 않고** 따로 보고한다
(그런 행은 sync_hira_hospital_info.py가 지역 칸을 갱신해서 해소한다).

사용법
  python backend/scripts/clear_bad_hospital_coords.py          # dry-run
  python backend/scripts/clear_bad_hospital_coords.py --apply  # 백업 뜨고 반영
  python backend/scripts/clear_bad_hospital_coords.py --restore  # 되돌리기
"""
import argparse
import collections
import json
import math
import os
import shutil
import sqlite3
import statistics
import sys
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE, "data.db")
UNDO_PATH = os.path.join(BASE, "bad_coords_undo.json")

MIN_CLUSTER = 5       # 중앙좌표를 믿을 수 있는 최소 표본
MIN_DIST_KM = 50.0    # 기준 1
P90_FACTOR = 2.0      # 기준 2
NEAR_RATIO = 3.0      # 기준 3

# address 앞머리의 시도 표기 -> 우리 DB sido 값. 광주는 전남에 통합돼 있다
# (merge_gwangju_into_jeonnam.py) — 주소가 '광주광역시'여도 sido는 '전라남도'다.
ADDR_SIDO = {
    "서울특별시": "서울특별시", "부산광역시": "부산광역시", "대구광역시": "대구광역시",
    "인천광역시": "인천광역시", "대전광역시": "대전광역시", "울산광역시": "울산광역시",
    "세종특별자치시": "세종특별자치시", "경기도": "경기도", "강원특별자치도": "강원특별자치도",
    "강원도": "강원특별자치도", "충청북도": "충청북도", "충청남도": "충청남도",
    "전북특별자치도": "전북특별자치도", "전라북도": "전북특별자치도",
    # 심평원 주소 원문은 광주를 '전남광주통합특별시'로 적는다 (85,320행 중 5,322행)
    "전라남도": "전라남도", "광주광역시": "전라남도", "전남광주통합특별시": "전라남도",
    "경상북도": "경상북도", "경상남도": "경상남도", "제주특별자치도": "제주특별자치도",
}


def addr_sido(address):
    """주소 문자열이 가리키는 시도(우리 DB 표기). 모르면 None."""
    head = (address or "").strip().split(" ", 1)[0]
    return ADDR_SIDO.get(head)


def haversine(lat1, lng1, lat2, lng2):
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def find_outliers(conn):
    """(지울 것, 지역칸이 낡은 것) 두 목록을 돌려준다. 두 번째는 좌표를 건드리지 않는다."""
    rows = conn.execute(
        "SELECT id, name, sido, sigungu, lat, lng, type, address FROM hospitals "
        "WHERE lat IS NOT NULL AND lng IS NOT NULL AND sido IS NOT NULL AND sigungu IS NOT NULL"
    ).fetchall()

    clusters = collections.defaultdict(list)
    for r in rows:
        clusters[(r[2], r[3])].append(r)

    center, p90 = {}, {}
    for key, members in clusters.items():
        if len(members) < MIN_CLUSTER:
            continue
        center[key] = (
            statistics.median(m[4] for m in members),
            statistics.median(m[5] for m in members),
        )
        ds = sorted(haversine(m[4], m[5], *center[key]) for m in members)
        p90[key] = ds[max(0, int(len(ds) * 0.9) - 1)]

    keys = list(center)
    out, stale_region = [], []
    for key, members in clusters.items():
        if key not in center:
            continue
        for r in members:
            d_own = haversine(r[4], r[5], *center[key])
            if d_own <= MIN_DIST_KM or d_own <= P90_FACTOR * max(p90[key], 1.0):
                continue
            d_near, near_key = min((haversine(r[4], r[5], *center[k]), k) for k in keys)
            if near_key == key or d_near >= d_own / NEAR_RATIO:
                continue
            hit = {
                "id": r[0], "name": r[1], "sido": r[2], "sigungu": r[3], "type": r[6],
                "lat": r[4], "lng": r[5],
                "dist_own_km": round(d_own, 1),
                "nearest_sido": near_key[0], "nearest_sigungu": near_key[1],
                "nearest_km": round(d_near, 1),
            }
            # 기준 4 — 주소가 좌표 쪽 지역을 가리키면 좌표가 맞고 지역 칸이 낡은 것이다.
            # 이 경우 좌표를 지우면 멀쩡한 마커를 잃는다 (보고서 E2, 281/305건이 이 경우였다).
            asido = addr_sido(r[7])
            if asido and asido == near_key[0] and asido != r[2]:
                hit["addr_sido"] = asido
                stale_region.append(hit)
                continue
            out.append(hit)
    out.sort(key=lambda x: -x["dist_own_km"])
    stale_region.sort(key=lambda x: -x["dist_own_km"])
    return out, stale_region


def restore(conn, db_path):
    if not os.path.exists(UNDO_PATH):
        print(f"되돌릴 기록이 없습니다: {UNDO_PATH}")
        return
    with open(UNDO_PATH, encoding="utf-8") as f:
        saved = json.load(f)
    n = 0
    for row in saved:
        n += conn.execute(
            "UPDATE hospitals SET lat = ?, lng = ? WHERE id = ? AND lat IS NULL",
            (row["lat"], row["lng"], row["id"]),
        ).rowcount
        conn.execute(
            "INSERT OR REPLACE INTO hospitals_rtree(id, min_lat, max_lat, min_lng, max_lng) "
            "VALUES (?, ?, ?, ?, ?)",
            (row["id"], row["lat"], row["lat"], row["lng"], row["lng"]),
        )
    conn.commit()
    print(f"복원 완료: {n}행")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제로 반영 (기본은 dry-run)")
    ap.add_argument("--restore", action="store_true", help="되돌리기")
    ap.add_argument("--db", default=DB_PATH)
    args = ap.parse_args()

    if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
        sys.stdout.reconfigure(encoding="utf-8")

    conn = sqlite3.connect(args.db)

    if args.restore:
        restore(conn, args.db)
        return

    bad, stale = find_outliers(conn)
    print(f"DB: {args.db}")

    if stale:
        print(f"\n[좌표는 맞고 지역 칸이 낡은 행] {len(stale)}행 — **좌표를 지우지 않는다**")
        print("  주소가 좌표 쪽 지역을 가리킨다. sync_hira_hospital_info.py로 지역 칸을 갱신하면 해소된다.")
        for b in stale[:10]:
            print(f"    id={b['id']:6d} {b['name'][:20]:22s} 지역칸 {b['sido']} {b['sigungu']}"
                  f"  ↔ 주소·좌표 {b['addr_sido']} {b['nearest_sigungu']}")
        if len(stale) > 10:
            print(f"    ... 외 {len(stale) - 10}건")

    print(f"\n좌표 오류 확정 건수: {len(bad)}행")
    by_sido = collections.Counter(b["sido"] for b in bad)
    print(f"  시도별: {dict(by_sido.most_common())}")
    print()
    for b in bad[:20]:
        print(f"  id={b['id']:6d} {b['name'][:20]:22s} {b['sido']} {b['sigungu']}"
              f"  → 좌표는 {b['nearest_sido']} {b['nearest_sigungu']} 부근"
              f" (자기구역에서 {b['dist_own_km']}km)")
    if len(bad) > 20:
        print(f"  ... 외 {len(bad) - 20}건")

    if not bad:
        print("처리할 항목이 없습니다.")
        return

    if not args.apply:
        print()
        print("[dry-run] 실제 반영하려면 --apply 를 붙여 다시 실행하세요.")
        return

    backup = f"{args.db}.bak_bad_coords_{int(time.time())}"
    shutil.copy2(args.db, backup)
    print()
    print(f"백업 생성: {backup}")

    prev = []
    if os.path.exists(UNDO_PATH):
        with open(UNDO_PATH, encoding="utf-8") as f:
            prev = json.load(f)
    known = {p["id"] for p in prev}
    with open(UNDO_PATH, "w", encoding="utf-8") as f:
        json.dump(prev + [b for b in bad if b["id"] not in known], f, ensure_ascii=False, indent=1)
    print(f"원좌표 보관(복원용): {UNDO_PATH}")

    ids = [b["id"] for b in bad]
    changed = 0
    for hid in ids:
        changed += conn.execute(
            "UPDATE hospitals SET lat = NULL, lng = NULL WHERE id = ?", (hid,)
        ).rowcount
        conn.execute("DELETE FROM hospitals_rtree WHERE id = ?", (hid,))
    conn.commit()
    print(f"반영 완료: {changed}행 좌표 제거 (지도 마커에서 제외, 목록 검색에는 그대로 노출)")
    print(f"재실행 검증(멱등): 남은 대상 {len(find_outliers(conn)[0])}행")


if __name__ == "__main__":
    main()
