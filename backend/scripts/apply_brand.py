"""equipment.brand(표시용 제조사)를 채운다 — 레거시 6분류는 브랜드 표, 심평원 분류는 허가번호.

왜 이렇게 하는가:
  식약처 허가번호가 주는 제조사는 **제조원**이다. 영업이 보고 싶은 건 브랜드다. 그렇다고
  manufacturer 를 덮어쓰면 "이 값이 어떤 허가번호에서 나왔나"를 잃는다. 그래서 브랜드는
  brand 컬럼에 따로 적고, manufacturer 는 건드리지 않는다.

대상별 규칙 (규칙 본문은 app/brand_map.py):
  레거시 6분류(us, xray, carm, mri, bmd, ct)
    brand_map.BRAND_RULES 손수 관리 표에 있으면 그 브랜드, 없으면 manufacturer 그대로.
  심평원 원본 출처(source='hira_*'/'odcloud_*')의 나머지 분류 (C108 등)
    1) mfds_permits(sync_mfds_permits.py)로 허가번호 → 회사: 국내 제조 허가는 허가 업체,
       수입 허가는 제조원. 허가 행들이 회사 둘 이상을 가리키면 쓰지 않는다(그 번호의 기존
       manufacturer 도 '유력'일 때만 쓴다).
       구성품 허가(디텍터·센서…)는 장비 브랜드가 아니라 비운다.
    2) 1)이 없으면 manufacturer(assign_equipment_manufacturer.py 결과)를 회사 표기로 정리해서.
    3) 그래도 빈 행은 같은 (분류, 모델명)에서 확정 대수의 95% 이상이 한 회사면 그 회사.
    회사 표기는 COMPANY_ALIASES 로 묶고, 표시명은 레거시 6분류 표기를 그대로 쓴다.
  그 밖(source='manual' 등): manufacturer 그대로.

순서: sync_mfds_device_makers → assign_equipment_manufacturer → sync_mfds_permits → 이 스크립트.

안전장치: dry-run 기본(--dry-run 도 같은 뜻) · --apply 시 DB 백업 + 되돌리기 JSON ·
  멱등(재실행하면 0행) · --restore

사용법:
  python backend/scripts/apply_brand.py                 # dry-run (분류별 제조사 빈칸 전/후 표)
  python backend/scripts/apply_brand.py --year 2024     # 표를 볼 연도 (기본: 최신 연도)
  python backend/scripts/apply_brand.py --apply
  python backend/scripts/apply_brand.py --restore
"""
import argparse
import collections
import json
import os
import shutil
import sqlite3
import sys
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
from app.brand_map import (  # noqa: E402
    BRAND_RULES, brand_of, company_display, license_company, license_names, model_key, propagate,
)

DEFAULT_DB = os.path.join(BASE, "data.db")
UNDO_PATH = os.path.join(BASE, "brand_undo.json")
LEGACY_CATEGORIES = ("us", "xray", "carm", "mri", "bmd", "ct")
HIRA_SOURCES = ("hira_", "odcloud_")


def license_index(conn):
    """license_no -> (회사, 구성품 허가인가) | None(허가 행이 회사 여럿을 가리킴).

    허가 행에 회사가 아예 없는 번호(제조원 칸이 빈 수입 허가 등)는 넣지 않는다 — 그런 번호는
    허가 자료에 없는 번호처럼 기존 manufacturer 를 쓴다.
    mfds_permits 가 없거나 비어 있으면 빈 dict — 그때는 manufacturer 정리 + 모델 전파만 한다.
    """
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'mfds_permits'").fetchone():
        return {}
    groups = collections.defaultdict(list)
    for lic, *rest in conn.execute(
        "SELECT license_no, entrps, manuf_nm, product, permit_date, changed_date "
        "FROM mfds_permits WHERE license_no IS NOT NULL"
    ):
        groups[lic].append(tuple(rest))
    return {lic: license_company(lic, ps) for lic, ps in groups.items() if license_names(lic, ps)}


def resolve(cat, model, lic, mfr, source, conf, lic_idx):
    """(표시 제조사 | None, 근거). 모델 전파 전 단계. conf 는 manufacturer_confidence."""
    if cat in LEGACY_CATEGORIES:
        return brand_of(cat, model) or mfr, "legacy"
    if not (source or "").startswith(HIRA_SOURCES):
        return mfr, "as_is"
    if lic in lic_idx:
        hit = lic_idx[lic]
        if hit and hit[1]:
            return None, "component"
        if hit:
            return hit[0], "permit"
        # 허가 행이 회사 여럿을 가리키는 번호 — 허가 자료로는 정할 수 없다. 기존 manufacturer 도
        # 그 여러 회사 중 하나를 고른 값이라, 형명이 모델명과 맞았던 '유력'만 쓴다.
        # (2024 실측: 모델 전파와 일치 — 유력 91.7%, 확인 12.5%, 미확인 22%)
        if conf != "유력":
            return None, "ambiguous"
    name = company_display(mfr)
    return (name, "mfr") if name else (None, "none")


def compute(conn, lic_idx):
    """조합 (연도, 분류, 모델, 허가번호, manufacturer, 출처, 신뢰도) -> [표시 제조사, 근거, 대수]."""
    combos = {}
    votes = collections.defaultdict(collections.Counter)
    for year, cat, model, lic, mfr, source, conf, units in conn.execute(
        "SELECT year, category, model, license_no, manufacturer, source, manufacturer_confidence, "
        "SUM(eq_count) FROM equipment GROUP BY 1, 2, 3, 4, 5, 6, 7"
    ):
        want, how = resolve(cat, model, lic, mfr, source, conf, lic_idx)
        combos[(year, cat, model, lic, mfr, source, conf)] = [want, how, units or 0]
        if want and how in ("permit", "mfr"):
            votes[model_key(cat, model)][want] += units or 0
    prop = propagate(votes)
    for (_, cat, model, *_), v in combos.items():
        if v[0] is None and v[1] in ("component", "ambiguous", "none"):
            hit = prop.get(model_key(cat, model))
            if hit:
                v[0], v[1] = hit, f"prop({v[1]})"
    return combos


def plan(conn, combos):
    """바꿔야 할 (id, 현재 brand, 새 brand). 이미 같은 값이면 빠진다(멱등).

    **brand 는 전 행에 채운다** — 조회에서 CASE 식을 없애려는 것이다(app/brand_map.py
    display_maker 주석 참고). manufacturer 원본은 건드리지 않으므로 근거는 그대로 남는다.
    """
    todo = []
    for eid, year, cat, model, lic, mfr, source, conf, cur in conn.execute(
        "SELECT id, year, category, model, license_no, manufacturer, source, "
        "manufacturer_confidence, brand FROM equipment"
    ):
        want = combos[(year, cat, model, lic, mfr, source, conf)][0]
        if want != cur:
            todo.append((eid, cur, want))
    return todo


def coverage_table(conn, combos, year, top):
    """분류별 '제조사 없음' 대수 비율 — 지금(brand) vs 이 스크립트 반영 후. 대수가 0인 분류·연도는 0%로 적는다."""
    pct = lambda n, d: (n / d * 100) if d else 0.0  # noqa: E731
    before = {cat: (name, units, empty) for cat, name, units, empty in conn.execute(
        "SELECT category, MAX(category_name), SUM(eq_count), "
        "SUM(CASE WHEN brand IS NULL OR brand = '' THEN eq_count ELSE 0 END) "
        "FROM equipment WHERE year = ? GROUP BY category", (year,))}
    after = collections.Counter()
    how_units = collections.Counter()
    for (y, cat, *_), (want, how, units) in combos.items():
        if y != year:
            continue
        if not want:
            after[cat] += units
        if cat not in LEGACY_CATEGORIES:
            how_units[how] += units
    cats = sorted((c for c in before if c not in LEGACY_CATEGORIES), key=lambda c: -before[c][1])[:top]
    cats += [c for c in LEGACY_CATEGORIES if c in before]
    print(f"\n[{year}] 분류별 제조사 없음 (대수 기준)  지금 -> 반영 후")
    for cat in cats:
        name, units, empty = before[cat]
        units, empty = units or 0, empty or 0
        print(f"  {cat:5s} {(name or '')[:16]:16s} {units:8,}대  {pct(empty, units):5.1f}% -> "
              f"{pct(after[cat], units):5.1f}%")
    tot = sum(v[1] or 0 for c, v in before.items() if c not in LEGACY_CATEGORIES)
    emp_b = sum(v[2] or 0 for c, v in before.items() if c not in LEGACY_CATEGORIES)
    emp_a = sum(after[c] for c in before if c not in LEGACY_CATEGORIES)
    print(f"  6분류 밖 전체 {tot:,}대  {pct(emp_b, tot):.1f}% -> {pct(emp_a, tot):.1f}%")
    print(f"\n[{year}] 6분류 밖 근거별 대수")
    for how, n in how_units.most_common():
        print(f"  {how:16s} {n:9,} ({pct(n, tot):5.1f}%)")


def restore(conn):
    if not os.path.exists(UNDO_PATH):
        print(f"되돌릴 기록이 없습니다: {UNDO_PATH}")
        return 1
    with open(UNDO_PATH, encoding="utf-8") as f:
        undo = json.load(f)
    conn.executemany("UPDATE equipment SET brand = ? WHERE id = ?",
                     [(old, eid) for eid, old in undo])
    conn.commit()
    os.rename(UNDO_PATH, UNDO_PATH + ".done")
    print(f"brand {len(undo):,}행 복원 완료.")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true", help="실제 반영 (기본은 dry-run)")
    ap.add_argument("--dry-run", action="store_true", help="반영하지 않고 표만 출력 (기본 동작)")
    ap.add_argument("--restore", action="store_true", help="되돌리기")
    ap.add_argument("--year", type=int, default=0, help="빈칸 표를 볼 연도 (0=최신)")
    ap.add_argument("--top", type=int, default=25, help="빈칸 표에 보일 분류 수 (6분류 밖, 대수순)")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    conn = sqlite3.connect(args.db, timeout=60)
    print(f"DB: {args.db}")
    if args.restore:
        return restore(conn)

    t0 = time.time()
    lic_idx = license_index(conn)
    n_amb = sum(1 for v in lic_idx.values() if v is None)
    n_comp = sum(1 for v in lic_idx.values() if v and v[1])
    print(f"허가번호 색인 {len(lic_idx):,}개 (회사 여럿이라 안 씀 {n_amb:,} · 구성품 허가 {n_comp:,}) · "
          f"브랜드 표 {len(BRAND_RULES)}줄")
    combos = compute(conn, lic_idx)
    todo = plan(conn, combos)
    print(f"값이 바뀌는 행 {len(todo):,} ({time.time() - t0:.0f}초)")

    year = args.year or conn.execute(
        "SELECT MAX(year) FROM equipment WHERE source LIKE 'hira_%' OR source LIKE 'odcloud_%'"
    ).fetchone()[0]
    coverage_table(conn, combos, year, args.top)

    per = collections.Counter((cur, want) for _, cur, want in todo)
    print("\n바뀌는 값 상위 30 (지금 brand -> 새 brand | 행수)")
    for (cur, want), n in per.most_common(30):
        print(f"  {n:7,} | {cur} -> {want}")

    if args.dry_run or not args.apply:
        print("\n[dry-run] 실제 반영하려면 --apply 를 붙이세요.")
        return 0

    backup = f"{args.db}.bak_brand_{int(time.time())}"
    shutil.copy2(args.db, backup)
    print(f"\n백업 생성: {backup}")

    with open(UNDO_PATH, "w", encoding="utf-8") as f:
        json.dump([(eid, cur) for eid, cur, _ in todo], f, ensure_ascii=False)
    conn.executemany("UPDATE equipment SET brand = ? WHERE id = ?",
                     [(want, eid) for eid, _, want in todo])
    conn.commit()
    print(f"brand {len(todo):,}행 갱신 · 되돌리기 기록: {UNDO_PATH}")

    again = plan(conn, compute(conn, license_index(conn)))
    print(f"[반영 후] 다시 계산하면 바뀌는 행 {len(again)}행 (0이어야 정상 — 멱등)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
