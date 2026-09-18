"""영업지도 hospitals.sigungu 표기 정규화 (재실행 가능 / 멱등).

배경
----
hospitals는 두 개의 임포트 소스가 섞여 있고 시군구 표기 규칙이 서로 다르다.
  - 심평원(의원/병원/치과/한의원 등): '부산남구', '성남분당구'  (시도약칭·'시' 생략 붙임형)
  - 동물병원 공공데이터            : '남구',     '성남시 분당구' (정식 명칭형)
같은 행정구역이 두세 가지 값으로 쪼개져 있어서 /api/regions/sigungu 드롭다운에
'남구'와 '부산남구'가 따로 뜨고, 어느 쪽을 골라도 나머지 병원이 검색되지 않는다.

정규화 규칙 (데이터 기반 — 존재하지 않는 명칭을 새로 만들지 않는다)
  1) canon key = sigungu에서 '<시>' + 공백을 제거해 붙임형으로 접음
     예) '성남시 분당구' -> '성남분당구'
  2) 같은 sido 안에서 '<시도약칭>' 접두를 뗀 형태가 이미 존재하는 값일 때만 접두를 뗌
     예) 부산 '부산남구' -> key '남구' (bare '남구'가 실재하므로 병합)
         부산 '부산진구' -> key '부산진구' (bare '진구'가 없으므로 그대로 — 오병합 방지)
  3) 같은 canon key를 가진 raw 값이 2개 이상이면 그 중 행수가 가장 많은 raw 값으로 통일
  4) 세종특별자치시는 시군구가 없는 단층제 — '세종특별자치시' -> '세종시'만 추가로 통일
     (도로명이 들어간 나머지 값은 손대지 않고 리포트만 한다)

[2단계] 시(市) 단위로만 기록된 행을 주소에서 구(區)를 읽어 구 단위로 승격
  같은 시도에 '성남분당구' 같은 구 단위 값이 이미 있는데 일부 행이 '성남시'로만
  기록돼 있으면, 지도에서 '분당구'로 필터링해도 그 병원이 안 나온다.
  address가 있는 행에 한해 '<도시>시 <구>' 패턴으로 구를 추출해 승격한다.
  (주소가 없는 심평원 행은 판별 근거가 없으므로 손대지 않는다)

사용법
  python backend/scripts/normalize_hospital_region.py            # dry-run (변경 건수만 출력)
  python backend/scripts/normalize_hospital_region.py --apply    # 백업 뜨고 실제 반영
"""
import argparse
import collections
import json
import os
import re
import shutil
import sqlite3
import sys
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get("NORMALIZE_DB_PATH") or os.path.join(BASE, "data.db")

SIDO_ABBR = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천",
    "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종",
    "경기도": "경기", "강원특별자치도": "강원", "충청북도": "충북", "충청남도": "충남",
    "전북특별자치도": "전북", "전라남도": "전남", "경상북도": "경북", "경상남도": "경남",
    "제주특별자치도": "제주",
}

# 세종은 단층제라 시군구가 없다. 두 표기만 통일한다.
EXPLICIT = {("세종특별자치시", "세종특별자치시"): "세종시"}


def collapse(sigungu: str) -> str:
    """'성남시 분당구' -> '성남분당구'. 그 외에는 공백만 제거."""
    s = re.sub(r"시\s+(?=\S+구$)", "", sigungu)
    return s.replace(" ", "")


def build_mapping(conn):
    """(sido, raw_sigungu) -> canonical_sigungu 매핑을 데이터에서 유도한다.

    같은 시도 안에서 표기 스타일이 뒤섞이지 않도록(예: '안산시 상록구'와 '안산단원구'가
    드롭다운에 같이 뜨는 일이 없도록) 승자는 그룹별 최다행이 아니라
    **시도 단위 우세 스타일**로 고른다.
    스타일은 두 축이다 — (1) 시도약칭 접두 유무, (2) '<시> ' 띄어쓰기 유무.
    """
    rows = conn.execute(
        "SELECT sido, sigungu, COUNT(*) FROM hospitals "
        "WHERE sido IS NOT NULL AND sigungu IS NOT NULL GROUP BY 1, 2"
    ).fetchall()

    per_sido = collections.defaultdict(dict)  # sido -> {raw: count}
    for sido, sgg, n in rows:
        per_sido[sido][sgg] = n

    mapping = {}
    for sido, raws in per_sido.items():
        abbr = SIDO_ABBR.get(sido, "")
        collapsed = {raw: collapse(raw) for raw in raws}
        existing_keys = set(collapsed.values())

        # 규칙 2: 접두를 뗀 형태가 이미 실재할 때만 접두 제거
        keys, has_prefix = {}, {}
        for raw, col in collapsed.items():
            key, pref = col, False
            if abbr and col.startswith(abbr) and len(col) > len(abbr):
                stripped = col[len(abbr):]
                if stripped in existing_keys:
                    key, pref = stripped, True
            keys[raw] = key
            has_prefix[raw] = pref

        groups = collections.defaultdict(list)
        for raw, key in keys.items():
            groups[key].append(raw)
        split = {k: v for k, v in groups.items() if len(v) > 1}
        if not split:
            continue

        # 시도 단위 우세 스타일 결정 (쪼개진 그룹에 속한 행만 집계)
        score = collections.Counter()
        for members in split.values():
            for raw in members:
                score[("prefix", has_prefix[raw])] += raws[raw]
                score[("spaced", raw != collapsed[raw])] += raws[raw]
        want_prefix = score[("prefix", True)] > score[("prefix", False)]
        want_spaced = score[("spaced", True)] > score[("spaced", False)]

        for key, members in split.items():
            exact = [r for r in members
                     if has_prefix[r] == want_prefix and (r != collapsed[r]) == want_spaced]
            pool = exact or members
            winner = max(pool, key=lambda r: (raws[r], r))
            for raw in members:
                if raw != winner:
                    mapping[(sido, raw)] = winner

    mapping.update(EXPLICIT)
    # 이미 목표값과 같은 항목은 제거(멱등)
    return {k: v for k, v in mapping.items() if k[1] != v}


def build_promotions(conn):
    """시 단위로만 기록된 행 중, 주소에서 구를 읽어낼 수 있는 행 -> (id, 새 sigungu)."""
    per_sido = collections.defaultdict(list)
    for sido, sgg in conn.execute(
        "SELECT DISTINCT sido, sigungu FROM hospitals WHERE sido IS NOT NULL AND sigungu IS NOT NULL"
    ):
        per_sido[sido].append(sgg)

    out = []
    for sido, values in per_sido.items():
        for city in values:
            if not city.endswith("시"):
                continue
            base = city[:-1]
            districts = [v for v in values if v != city and v.startswith(base) and v.endswith("구")]
            if not districts:
                continue
            by_gu = {}
            for d in districts:
                by_gu[collapse(d)[len(base):]] = d
            pat = re.compile(re.escape(base) + r"시\s+([가-힣]{1,6}구)(?=[\s,]|$)")
            for hid, addr in conn.execute(
                "SELECT id, address FROM hospitals WHERE sido = ? AND sigungu = ? AND address IS NOT NULL",
                (sido, city),
            ):
                m = pat.search(addr)
                if m and m.group(1) in by_gu:
                    out.append((hid, by_gu[m.group(1)], sido, city))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제로 DB를 수정한다 (기본은 dry-run)")
    ap.add_argument("--db", default=DB_PATH)
    args = ap.parse_args()

    if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
        sys.stdout.reconfigure(encoding="utf-8")

    conn = sqlite3.connect(args.db)

    plan = []
    total = 0
    for (sido, raw), winner in sorted(build_mapping(conn).items()):
        n = conn.execute(
            "SELECT COUNT(*) FROM hospitals WHERE sido = ? AND sigungu = ?", (sido, raw)
        ).fetchone()[0]
        if n:
            plan.append((sido, raw, winner, n))
            total += n

    promos = build_promotions(conn)

    print(f"DB: {args.db}")
    print(f"[1단계] 표기 통일: {len(plan)}개 표기 / {total}행")
    for sido, raw, winner, n in plan:
        print(f"  {sido:9s} '{raw}' -> '{winner}'  ({n}행)")

    print()
    print(f"[2단계] 주소 기반 구 승격: {len(promos)}행")
    promo_agg = collections.Counter((p[2], p[3], p[1]) for p in promos)
    for (sido, city, winner), n in sorted(promo_agg.items()):
        print(f"  {sido:9s} '{city}' -> '{winner}'  ({n}행)")

    print()
    print(f"합계 {total + len(promos)}행 변경 예정")

    if total == 0 and not promos:
        print("변경할 항목이 없습니다 (이미 정규화됨).")
        return

    if not args.apply:
        print()
        print("[dry-run] 실제 반영하려면 --apply 를 붙여 다시 실행하세요.")
        return

    backup = f"{args.db}.bak_region_normalize_{int(time.time())}"
    shutil.copy2(args.db, backup)
    print()
    print(f"백업 생성: {backup}")

    undo = []
    for sido, raw, winner, _n in plan:
        ids = [r[0] for r in conn.execute(
            "SELECT id FROM hospitals WHERE sido = ? AND sigungu = ?", (sido, raw)
        )]
        undo.append({"sido": sido, "from": raw, "to": winner, "ids": ids})
    for hid, winner, sido, city in promos:
        undo.append({"sido": sido, "from": city, "to": winner, "ids": [hid]})

    undo_path = os.path.join(os.path.dirname(os.path.abspath(args.db)), "region_normalize_undo.json")
    prev = []
    if os.path.exists(undo_path):
        with open(undo_path, encoding="utf-8") as f:
            prev = json.load(f)
    with open(undo_path, "w", encoding="utf-8") as f:
        json.dump(prev + undo, f, ensure_ascii=False)
    print(f"되돌리기용 id 목록: {undo_path}")

    changed = 0
    for sido, raw, winner, _n in plan:
        changed += conn.execute(
            "UPDATE hospitals SET sigungu = ? WHERE sido = ? AND sigungu = ?", (winner, sido, raw)
        ).rowcount
    for hid, winner, _sido, _city in promos:
        changed += conn.execute(
            "UPDATE hospitals SET sigungu = ? WHERE id = ?", (winner, hid)
        ).rowcount
    conn.commit()
    print(f"반영 완료: {changed}행 업데이트")

    remaining = sum(
        conn.execute("SELECT COUNT(*) FROM hospitals WHERE sido = ? AND sigungu = ?", k).fetchone()[0]
        for k in build_mapping(conn)
    ) + len(build_promotions(conn))
    print(f"재실행 검증(멱등): 남은 변경대상 {remaining}행")


if __name__ == "__main__":
    main()
