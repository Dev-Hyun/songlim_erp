"""source='hira_2025' 행의 비어 있는 license_no 를 odcloud 2025 API 로 채운다.

왜 필요한가:
  `hira_2025` 는 심평원 '의료장비 상세 현황' CSV 로 적재한 2025 스냅샷이다. 그런데 CSV 를
  적재한 시점에 따라 `license_no` 가 통째로 비어 있는 DB가 있다(2026-09 기준 운영 서버가
  그랬다: 466,046행 전부 NULL). 허가번호가 없으면 식약처 대조가 불가능해 **제조사가 한 건도
  붙지 않는다.**

  그 값이 로컬 CSV(수백 MB)에만 있다고 보기 쉬운데, 사실 **같은 2025 데이터를 odcloud API 가
  `장비허가번호` 컬럼까지 포함해 제공한다**(2026-09-20 확인: totalCount 711,808).
  그래서 CSV 를 옮길 필요가 없다.

왜 삭제-재임포트가 아니라 백필인가:
  `hira_2025` 를 지우고 odcloud 로 다시 받는 방법도 있다. 다만 그건 운영 DB에서 46만 행을
  지우는 일이라, 빈 칸만 채우는 UPDATE 가 훨씬 안전하다. 이 스크립트는 **행을 만들지도
  지우지도 않고, license_no 가 NULL 인 행만 채운다.**

매칭 키: (요양기호, 장비대분류코드, 모델명)
  hira_2025 는 `category` 와 `category_code` 가 같고(실측 99.6%), 병원에 `ykiho` 가 있다.
  odcloud 응답의 `암호화된 요양기호` / `장비대분류코드` / `모델명` 과 그대로 맞물린다.

안전장치: dry-run 기본 · --apply 시 백업 + 되돌리기 JSON · 멱등 · --restore

사용법:
  python backend/scripts/backfill_hira2025_license.py           # dry-run
  python backend/scripts/backfill_hira2025_license.py --apply
  python backend/scripts/backfill_hira2025_license.py --restore
"""
import argparse
import json
import os
import shutil
import sqlite3
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from apply_audit_fixes import is_junk_license
from import_odcloud_equipment_years import UDDI, fetch, load_key, norm_license

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BASE, "data.db")
UNDO_PATH = os.path.join(BASE, "hira2025_license_undo.json")
YEAR = 2025


def build_license_map(key):
    """(요양기호, 대분류코드, 모델명) -> 허가번호. 허가번호가 없는 행은 담지 않는다."""
    _rows, total = fetch(key, UDDI[YEAR], 1)
    pages = (total + 999) // 1000
    out, seen_conflict = {}, 0
    for page in range(1, pages + 1):
        for attempt in range(3):
            try:
                items, _ = fetch(key, UDDI[YEAR], page)
                break
            except Exception as e:
                if attempt == 2:
                    raise SystemExit(f"{page}페이지 3회 실패: {type(e).__name__}: {e}")
                time.sleep(3)
        if not items:
            break
        for x in items:
            lic = norm_license(x.get("장비허가번호"))
            # odcloud 원본에도 '0'·'미확인'·'임시00-0000호' 같은 자리표시자가 섞여 있다.
            # 그대로 채우면 허가번호 칸에 쓰레기를 새로 심는 꼴이라 여기서 거른다.
            if not lic or is_junk_license(lic):
                continue
            k = (
                (x.get("암호화된 요양기호") or "").strip(),
                (x.get("장비대분류코드") or "").strip(),
                (x.get("모델명") or "").strip(),
            )
            if not all(k):
                continue
            # 같은 키에 허가번호가 둘 이상이면 원본이 그만큼 흐릿한 것이라 채우지 않는다
            if k in out and out[k] != lic:
                out[k] = None
                seen_conflict += 1
            elif k not in out:
                out[k] = lic
        if page % 50 == 0 or page == pages:
            sys.stdout.write(f"\r  수신 {page}/{pages} 페이지 · 키 {len(out):,}")
            sys.stdout.flush()
    print()
    if seen_conflict:
        print(f"  같은 키에 허가번호가 여러 개라 제외한 키: {seen_conflict:,}")
    return {k: v for k, v in out.items() if v}


def restore(conn):
    if not os.path.exists(UNDO_PATH):
        print(f"되돌릴 기록이 없습니다: {UNDO_PATH}")
        return 1
    with open(UNDO_PATH, encoding="utf-8") as f:
        ids = json.load(f)
    n = conn.executemany(
        "UPDATE equipment SET license_no = NULL WHERE id = ?", [(i,) for i in ids]
    ).rowcount
    conn.commit()
    os.rename(UNDO_PATH, UNDO_PATH + ".done")
    print(f"복원 완료: {n:,}행의 license_no 를 다시 비웠습니다.")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true", help="실제 반영 (기본은 dry-run)")
    ap.add_argument("--restore", action="store_true", help="되돌리기")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    conn = sqlite3.connect(args.db)
    print(f"DB: {args.db}")

    if args.restore:
        return restore(conn)

    todo = conn.execute(
        "SELECT COUNT(*) FROM equipment WHERE source = 'hira_2025' AND license_no IS NULL"
    ).fetchone()[0]
    print(f"license_no 가 비어 있는 hira_2025 행: {todo:,}")
    if not todo:
        print("채울 것이 없습니다.")
        return 0

    key = load_key()
    if not key:
        print("HIRA_API_KEY 를 찾을 수 없습니다 (환경변수 또는 backend/.env).")
        return 1

    print(f"odcloud {YEAR}년 수신 중…")
    lic_map = build_license_map(key)
    print(f"허가번호 색인 {len(lic_map):,}개")

    rows = conn.execute(
        "SELECT e.id, h.ykiho, e.category_code, e.category, e.model "
        "FROM equipment e JOIN hospitals h ON h.id = e.hospital_id "
        "WHERE e.source = 'hira_2025' AND e.license_no IS NULL AND h.ykiho IS NOT NULL"
    ).fetchall()

    updates, miss = [], 0
    for eid, yk, code, cat, model in rows:
        lic = lic_map.get((yk, (code or cat or "").strip(), (model or "").strip()))
        if lic:
            updates.append((lic, eid))
        else:
            miss += 1
    print(f"  채울 수 있음 {len(updates):,} · 매칭 실패 {miss:,} "
          f"· 병원에 요양기호가 없어 대상 밖 {todo - len(rows):,}")

    if not args.apply:
        for lic, eid in updates[:5]:
            print(f"    예) id={eid} -> {lic}")
        print("\n[dry-run] 실제 반영하려면 --apply 를 붙이세요.")
        return 0

    if not updates:
        print("반영할 것이 없습니다.")
        return 0

    backup = f"{args.db}.bak_hira2025_license_{int(time.time())}"
    shutil.copy2(args.db, backup)
    print(f"백업 생성: {backup}")
    with open(UNDO_PATH, "w", encoding="utf-8") as f:
        json.dump([eid for _lic, eid in updates], f)

    conn.executemany("UPDATE equipment SET license_no = ? WHERE id = ?", updates)
    conn.commit()
    conn.execute("ANALYZE")
    conn.commit()

    left = conn.execute(
        "SELECT COUNT(*) FROM equipment WHERE source = 'hira_2025' AND license_no IS NULL"
    ).fetchone()[0]
    print(f"반영 완료: {len(updates):,}행. 아직 비어 있는 hira_2025: {left:,}")
    print(f"되돌리기 기록: {UNDO_PATH}")
    print("다음: assign_equipment_manufacturer.py --apply 로 제조사를 붙이세요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
