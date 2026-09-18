"""광주를 전라남도 안으로 통합한다 (사용자 지시, 2026-09-18).

배경: 같은 광주인데 데이터 출처에 따라 두 갈래로 저장돼 있었다.
  - 심평원 유래 1,814행: sido='광주광역시', sigungu='광주북구' (주소 없음)
  - 동물병원 유래  130행: sido='전라남도',   sigungu='북구'     (주소가 '전남광주통합특별시…')
이 상태에서는 시도 드롭다운에 광주가 따로 뜨고, 전남을 골라도 심평원 광주 병원이 안 나온다.

처리:
  1) sido '광주광역시' -> '전라남도'
  2) 전남 안에 무접두로 남은 광주 자치구(북구/서구/남구/동구/광산구) -> '광주○구'로 통일
     (전라남도에는 자치구가 없으므로 이 5개는 전부 광주다 — 주소로 확인함)

사용법:
  python backend/scripts/merge_gwangju_into_jeonnam.py            # dry-run (건수만 출력)
  python backend/scripts/merge_gwangju_into_jeonnam.py --apply    # 백업 뜨고 실제 반영

멱등하다. 재실행하면 0행으로 끝난다.
"""
import argparse
import json
import os
import shutil
import sqlite3
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BASE, "data.db")
UNDO_PATH = os.path.join(BASE, "gwangju_merge_undo.json")

OLD_SIDO = "광주광역시"
NEW_SIDO = "전라남도"
# 전남엔 자치구가 없다 -> 아래 이름이 전남에 있으면 전부 광주 소속이다
DISTRICTS = {"북구": "광주북구", "서구": "광주서구", "남구": "광주남구",
             "동구": "광주동구", "광산구": "광주광산구"}


def plan(conn):
    sido_ids = [r[0] for r in conn.execute(
        "SELECT id FROM hospitals WHERE sido = ?", (OLD_SIDO,))]
    sgg = {}
    for raw, canon in DISTRICTS.items():
        ids = [r[0] for r in conn.execute(
            "SELECT id FROM hospitals WHERE sido = ? AND sigungu = ?", (NEW_SIDO, raw))]
        if ids:
            sgg[raw] = (canon, ids)
    return sido_ids, sgg


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true", help="실제로 DB를 수정한다 (기본은 dry-run)")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    sido_ids, sgg = plan(conn)

    print(f"DB: {args.db}")
    print(f"[1단계] sido '{OLD_SIDO}' -> '{NEW_SIDO}': {len(sido_ids)}행")
    print("[2단계] 전남 안 무접두 광주 자치구 통일:")
    total_sgg = 0
    for raw, (canon, ids) in sorted(sgg.items(), key=lambda kv: -len(kv[1][1])):
        print(f"    {raw} -> {canon}: {len(ids)}행")
        total_sgg += len(ids)
    if not sgg:
        print("    (없음)")
    print(f"\n합계 {len(sido_ids) + total_sgg}행 변경 예정")

    if not sido_ids and not sgg:
        print("변경할 항목이 없습니다 (이미 통합됨).")
        return 0
    if not args.apply:
        print("[dry-run] 실제 반영하려면 --apply 를 붙여 다시 실행하세요.")
        return 0

    backup = f"{args.db}.bak_gwangju_merge_{int(time.time())}"
    shutil.copy2(args.db, backup)
    print(f"백업 생성: {backup}")

    undo = {"sido": {"from": OLD_SIDO, "to": NEW_SIDO, "ids": sido_ids},
            "sigungu": [{"from": raw, "to": canon, "ids": ids} for raw, (canon, ids) in sgg.items()]}
    prev = []
    if os.path.exists(UNDO_PATH):
        with open(UNDO_PATH, encoding="utf-8") as f:
            prev = json.load(f)
    with open(UNDO_PATH, "w", encoding="utf-8") as f:
        json.dump(prev + [undo], f, ensure_ascii=False)
    print(f"되돌리기용 id 목록: {UNDO_PATH}")

    conn.execute("UPDATE hospitals SET sido = ? WHERE sido = ?", (NEW_SIDO, OLD_SIDO))
    for raw, (canon, _ids) in sgg.items():
        conn.execute("UPDATE hospitals SET sigungu = ? WHERE sido = ? AND sigungu = ?",
                     (canon, NEW_SIDO, raw))
    conn.commit()

    n = conn.execute("SELECT COUNT(*) FROM hospitals WHERE sido = ?", (NEW_SIDO,)).fetchone()[0]
    left = conn.execute("SELECT COUNT(*) FROM hospitals WHERE sido = ?", (OLD_SIDO,)).fetchone()[0]
    print(f"완료. 전라남도 {n}행, 광주광역시 잔여 {left}행")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
