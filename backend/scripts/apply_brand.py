"""레거시 6분류 장비에 시장 브랜드(equipment.brand)를 채운다.

왜 이렇게 하는가:
  식약처 허가번호가 주는 제조사는 **제조원**이다. 영업이 보고 싶은 건 브랜드다. 그렇다고
  manufacturer 를 덮어쓰면 "이 값이 어떤 허가번호에서 나왔나"를 잃는다. 그래서 브랜드는
  brand 컬럼에 따로 적고, manufacturer 는 건드리지 않는다.

  brand 가 NULL 이면 "브랜드 = manufacturer 값 그대로"라는 뜻이다. 실측 결과 레거시 6분류의
  manufacturer 는 이미 브랜드 표기라(식약처 client_name 쪽과 일치) 대부분 NULL 로 둔다.
  값을 쓰는 건 app/brand_map.py 표가 다른 브랜드를 지목한 행뿐이다.

대상: category in (us, xray, carm, mri, bmd, ct) — 사내 레거시 코드값 6종.
  심평원 전체 임포트로 들어온 장비대분류코드(C108 등) 행은 **건드리지 않는다.**

브랜드는 추측하지 않는다. app/brand_map.py 의 손수 관리 표에 있는 모델만 바꾸고, 표에 없는
모델은 그대로 둔다. 표는 한 줄마다 식약처 허가번호를 근거로 달고 있다.

안전장치: dry-run 기본 · --apply 시 DB 백업 + 되돌리기 JSON · 멱등(재실행하면 0행) · --restore

사용법:
  python backend/scripts/apply_brand.py            # dry-run (바뀔 행만 출력)
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
from app.brand_map import BRAND_RULES, brand_of  # noqa: E402

DEFAULT_DB = os.path.join(BASE, "data.db")
UNDO_PATH = os.path.join(BASE, "brand_undo.json")
LEGACY_CATEGORIES = ("us", "xray", "carm", "mri", "bmd", "ct")


def plan(conn):
    """바꿔야 할 (id, 현재 brand, 새 brand) 목록. 이미 같은 값이면 계획에서 빠진다(멱등)."""
    ph = ",".join("?" * len(LEGACY_CATEGORIES))
    todo = []
    for eid, cat, model, mfr, cur in conn.execute(
        f"SELECT id, category, model, manufacturer, brand FROM equipment "
        f"WHERE category IN ({ph}) AND model IS NOT NULL", LEGACY_CATEGORIES
    ):
        want = brand_of(cat, model)
        if want != cur:
            todo.append((eid, cat, model, mfr, cur, want))
    return todo


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
    ap.add_argument("--restore", action="store_true", help="되돌리기")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    conn = sqlite3.connect(args.db, timeout=60)
    print(f"DB: {args.db}")
    if args.restore:
        return restore(conn)

    todo = plan(conn)
    print(f"브랜드 표 {len(BRAND_RULES)}줄 · 값이 바뀌는 행 {len(todo):,}")

    per = collections.Counter()
    for _, cat, model, mfr, _, want in todo:
        per[(cat, model, mfr, want)] += 1
    print("\n(분류 | 모델 | manufacturer(그대로 둠) -> brand | 행수)")
    for (cat, model, mfr, want), n in per.most_common():
        print(f"  {n:6,} | {cat:5s} | {model[:44]:44s} | {mfr} -> {want}")

    if not args.apply:
        print("\n[dry-run] 실제 반영하려면 --apply 를 붙이세요.")
        return 0

    backup = f"{args.db}.bak_brand_{int(time.time())}"
    shutil.copy2(args.db, backup)
    print(f"\n백업 생성: {backup}")

    undo = [(eid, cur) for eid, _, _, _, cur, _ in todo]
    conn.executemany("UPDATE equipment SET brand = ? WHERE id = ?",
                     [(want, eid) for eid, _, _, _, _, want in todo])
    conn.commit()
    with open(UNDO_PATH, "w", encoding="utf-8") as f:
        json.dump(undo, f, ensure_ascii=False)
    print(f"brand {len(todo):,}행 갱신 · 되돌리기 기록: {UNDO_PATH}")

    ph = ",".join("?" * len(LEGACY_CATEGORIES))
    n_brand = conn.execute(
        "SELECT COUNT(*) FROM equipment WHERE brand IS NOT NULL").fetchone()[0]
    n_out = conn.execute(
        f"SELECT COUNT(*) FROM equipment WHERE brand IS NOT NULL "
        f"AND category NOT IN ({ph})", LEGACY_CATEGORIES).fetchone()[0]
    print(f"\n[반영 후] brand 보유 {n_brand:,}행 · 6분류 밖 brand {n_out}행 (0이어야 정상)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
