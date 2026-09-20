"""데이터 교차검증 보고서(2026-09-20)의 수정 제안을 반영한다.

보고서 5장 대비 반영 범위 (사용자 확정 2026-09-20):
  R2  hospitals.sido/sigungu 를 심평원 값으로          [hospitals]
  R4  hospitals.type 을 심평원 값으로                   [hospitals]
  R5  hospitals.name/name_norm 을 심평원 값으로         [hospitals]
  R3  source='import' 완전동일행 중복 삭제              [dupes]
  R9  허가번호 형식이 아닌 license_no -> NULL + 등급 강등 [license]
  R10 허가번호 품목계열이 어긋나는 행의 등급을 '미확인'으로 강등 [manufacturer]
  --  '추정' 등급(모델명 문자열 매칭) 제조사 전량 제거   [manufacturer]

제외 — 보고서에 있으나 반영하지 않는 것:
  R6  좌표 1km 초과 62건: 이전(移轉)인지 오류인지 건별 판단이 필요해 목록 보고만 한다.
  R7/R8 식약처 형명(TYPE_INFO) 매칭으로 레거시 제조사를 채우거나 고치는 것: 그 자체가
        모델명 문자열 알고리즘이라 "제조사는 허가번호 근거만 쓴다"는 방침과 모순된다.
  source='import' 510,168행의 제조사: 허가번호가 0건이라 재계산 근거가 없고 카탈로그
        제조사 드롭다운이 그 값에 의존한다. 손대지 않는다.

심평원 대조에는 audit_cross_validation.py가 받아 둔 캐시(_audit_cache/hira_hosp_fresh.jsonl)를
쓴다. 정규화 규칙(이름/시도/시군구 접기)도 같은 모듈에서 가져와 보고서 수치와 어긋나지 않게 한다.

안전장치: dry-run 기본 · --apply 시 DB 백업 + 되돌리기 JSON · 멱등(재실행하면 0행) · --restore

사용법:
  python backend/scripts/apply_audit_fixes.py                      # 전체 dry-run
  python backend/scripts/apply_audit_fixes.py --only hospitals     # 일부만
  python backend/scripts/apply_audit_fixes.py --apply
  python backend/scripts/apply_audit_fixes.py --restore
"""
import argparse
import collections
import json
import os
import shutil
import sqlite3
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audit_cross_validation import CL_MAP, SIDO_MAP, collapse_sgg, load_hira, nname

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BASE, "data.db")
UNDO_PATH = os.path.join(BASE, "audit_fixes_undo.json")
SECTIONS = ("hospitals", "dupes", "license", "manufacturer")

# R3에서 '완전히 같은 행'을 판정할 의미 컬럼. id/created_by/source는 제외한다.
DUPE_COLS = ("hospital_id", "category", "category_name", "category_code", "subcategory_name",
             "year", "manufacturer", "model", "model_series", "license_no",
             "manufacturer_confidence", "eq_count")


def build_sigungu_map(conn):
    """(sido, 접은표기) -> DB에서 실제로 쓰는 표기. sync_hira_hospital_info.py와 같은 규칙."""
    per = collections.defaultdict(collections.Counter)
    for sido, sgg, n in conn.execute(
        "SELECT sido, sigungu, COUNT(*) FROM hospitals "
        "WHERE sido IS NOT NULL AND sigungu IS NOT NULL GROUP BY 1, 2"
    ):
        per[(sido, collapse_sgg(sgg))][sgg] += n
    return {k: c.most_common(1)[0][0] for k, c in per.items()}


# --------------------------------------------------------------- R2 / R4 / R5
def plan_hospitals(conn, api):
    """심평원과 어긋나는 sido/sigungu/type/name 을 찾아 UPDATE 계획으로 만든다."""
    sggmap = build_sigungu_map(conn)
    plans, stat = [], collections.Counter()
    for yk, hid, name, nn, typ, sido, sgg in conn.execute(
        "SELECT ykiho, id, name, name_norm, type, sido, sigungu FROM hospitals "
        "WHERE ykiho IS NOT NULL"
    ):
        a = api.get(yk)
        if not a:
            continue
        sets, old = {}, {}

        asido = SIDO_MAP.get(a["sidoCdNm"])
        if asido and asido != sido:
            # 시도가 틀렸으면 시군구도 새 시도 기준으로 다시 잡는다
            asgg = sggmap.get((asido, collapse_sgg(a["sgguCdNm"])), a["sgguCdNm"])
            sets["sido"], old["sido"] = asido, sido
            stat["시도"] += 1
            if asgg and asgg != sgg:
                sets["sigungu"], old["sigungu"] = asgg, sgg
        elif asido:
            asgg = sggmap.get((asido, collapse_sgg(a["sgguCdNm"])), a["sgguCdNm"])
            if asgg and sgg and asgg != sgg:
                sets["sigungu"], old["sigungu"] = asgg, sgg
                stat["시군구"] += 1

        atype = CL_MAP.get(a["clCdNm"], a["clCdNm"])
        if atype and atype != typ:
            sets["type"], old["type"] = atype, typ
            stat["종별"] += 1

        aname = a["yadmNm"]
        if aname and nname(aname) != (nn or nname(name)):
            sets["name"], old["name"] = aname, name
            sets["name_norm"], old["name_norm"] = nname(aname), nn
            stat["기관명"] += 1

        if sets:
            plans.append((hid, sets, old))
    return plans, stat


# ----------------------------------------------------------------------- R3
def plan_dupes(conn):
    """source='import' 완전동일행 중 MIN(id)만 남기고 나머지 id를 반환."""
    group = ", ".join(DUPE_COLS)
    rows = conn.execute(
        f"SELECT GROUP_CONCAT(id) FROM equipment WHERE source='import' "
        f"GROUP BY {group} HAVING COUNT(*) > 1"
    ).fetchall()
    doomed = []
    for (ids,) in rows:
        parts = sorted(int(x) for x in ids.split(","))
        doomed.extend(parts[1:])  # 가장 작은 id를 원본으로 남긴다
    return doomed


# ----------------------------------------------------------------------- R9
def plan_license(conn):
    """허가번호 형식('제…'/'수…')이 아닌 값을 쓰는 행. license_no를 비우고 등급을 내린다."""
    return conn.execute(
        "SELECT id, license_no, manufacturer_confidence FROM equipment "
        "WHERE license_no IS NOT NULL AND license_no NOT GLOB '[제수]*'"
    ).fetchall()


# ------------------------------------------------------ 제조사 알고리즘 제거 / R10
def plan_manufacturer(conn):
    """(1) '추정' 등급 전량 제거  (2) 품목계열이 어긋나는 허가번호 근거 행을 '미확인'으로 강등."""
    guessed = conn.execute(
        "SELECT id, manufacturer, manufacturer_confidence, manufacturer_synced_at "
        "FROM equipment WHERE manufacturer_confidence = '추정'"
    ).fetchall()

    # 식약처가 '품목 1종'으로 확정한 허가번호를 우리는 2종 이상 장비분류에 쓰고 있는 행.
    # 번호 자체가 원본에서 잘못 적힌 것이라 제조사를 고칠 근거가 없다 -> 값은 두고 등급만 내린다.
    demote = conn.execute(
        "WITH single AS (SELECT license_no FROM mfds_device_items "
        "                GROUP BY 1 HAVING COUNT(DISTINCT item_name) = 1), "
        "     ours AS (SELECT license_no, COUNT(DISTINCT category_name) k FROM equipment "
        "              WHERE license_no IS NOT NULL GROUP BY 1) "
        "SELECT e.id, e.manufacturer_confidence FROM equipment e "
        "JOIN ours o ON o.license_no = e.license_no "
        "JOIN single s ON s.license_no = e.license_no "
        "WHERE o.k >= 2 AND e.manufacturer IS NOT NULL "
        "  AND e.manufacturer_confidence IN ('확인', '유력')"
    ).fetchall()
    return guessed, demote


# --------------------------------------------------------------------- 되돌리기
def restore(conn):
    if not os.path.exists(UNDO_PATH):
        print(f"되돌릴 기록이 없습니다: {UNDO_PATH}")
        return 1
    with open(UNDO_PATH, encoding="utf-8") as f:
        undo = json.load(f)

    n = 0
    for hid, old in undo.get("hospitals", []):
        cols = ", ".join(f"{k} = ?" for k in old)
        n += conn.execute(f"UPDATE hospitals SET {cols} WHERE id = ?",
                          list(old.values()) + [hid]).rowcount
    print(f"  hospitals {n:,}행 복원")

    rows = undo.get("dupes", [])
    if rows:
        cols = ["id", "source"] + list(DUPE_COLS)
        ph = ", ".join("?" * len(cols))
        conn.executemany(
            f"INSERT OR IGNORE INTO equipment ({', '.join(cols)}) VALUES ({ph})", rows)
        print(f"  삭제했던 장비 {len(rows):,}행 복원")

    n = 0
    for eid, lic, conf in undo.get("license", []):
        n += conn.execute(
            "UPDATE equipment SET license_no = ?, manufacturer_confidence = ? WHERE id = ?",
            (lic, conf, eid)).rowcount
    print(f"  license_no {n:,}행 복원")

    n = 0
    for eid, mfr, conf, synced in undo.get("guessed", []):
        n += conn.execute(
            "UPDATE equipment SET manufacturer = ?, manufacturer_confidence = ?, "
            "manufacturer_synced_at = ? WHERE id = ?", (mfr, conf, synced, eid)).rowcount
    for eid, conf in undo.get("demote", []):
        n += conn.execute(
            "UPDATE equipment SET manufacturer_confidence = ? WHERE id = ?", (conf, eid)).rowcount
    print(f"  제조사 {n:,}행 복원")

    conn.commit()
    os.rename(UNDO_PATH, UNDO_PATH + ".done")
    print("복원 완료.")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true", help="실제 반영 (기본은 dry-run)")
    ap.add_argument("--restore", action="store_true", help="되돌리기")
    ap.add_argument("--only", action="append", choices=SECTIONS,
                    help="일부 항목만 실행 (여러 번 지정 가능, 기본은 전체)")
    ap.add_argument("--refresh-hira", action="store_true", help="심평원 캐시를 새로 받는다")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    conn = sqlite3.connect(args.db)
    print(f"DB: {args.db}")

    if args.restore:
        return restore(conn)

    todo = set(args.only or SECTIONS)
    undo = {}

    # ---------------------------------------------------------------- 계획 수립
    hplans = hstat = None
    if "hospitals" in todo:
        api = load_hira(args.refresh_hira)
        print(f"심평원 캐시 {len(api):,}건")
        hplans, hstat = plan_hospitals(conn, api)
        print(f"\n[R2/R4/R5] 심평원과 어긋나는 hospitals: {len(hplans):,}행")
        for k in ("시도", "시군구", "종별", "기관명"):
            print(f"    {k:5s} {hstat[k]:,}")
        for hid, sets, old in hplans[:5]:
            chg = ", ".join(f"{k}: {old[k]!r} -> {v!r}" for k, v in sets.items() if k != "name_norm")
            print(f"    예) id={hid}  {chg}")

    doomed = None
    if "dupes" in todo:
        doomed = plan_dupes(conn)
        print(f"\n[R3] source='import' 완전동일행 초과분: {len(doomed):,}행 삭제 대상")

    lic = None
    if "license" in todo:
        lic = plan_license(conn)
        top = collections.Counter(r[1] for r in lic).most_common(5)
        print(f"\n[R9] 허가번호 형식이 아닌 값: {len(lic):,}행")
        print("    상위: " + ", ".join(f"{v!r} {n:,}" for v, n in top))

    guessed = demote = None
    if "manufacturer" in todo:
        guessed, demote = plan_manufacturer(conn)
        print(f"\n[제조사] '추정' 등급 제거 대상: {len(guessed):,}행 "
              "(모델명 문자열 매칭 — 허가번호 근거 없음)")
        print(f"[R10] 품목계열 불일치로 '미확인' 강등: {len(demote):,}행")

    if not args.apply:
        print("\n[dry-run] 실제 반영하려면 --apply 를 붙이세요.")
        return 0

    # ---------------------------------------------------------------- 반영
    backup = f"{args.db}.bak_audit_fixes_{int(time.time())}"
    shutil.copy2(args.db, backup)
    print(f"\n백업 생성: {backup}")

    if hplans:
        undo["hospitals"] = [(hid, old) for hid, _, old in hplans]
        for hid, sets, _ in hplans:
            cols = ", ".join(f"{k} = ?" for k in sets)
            conn.execute(f"UPDATE hospitals SET {cols} WHERE id = ?",
                         list(sets.values()) + [hid])
        print(f"hospitals {len(hplans):,}행 갱신")

    if doomed:
        cols = ["id", "source"] + list(DUPE_COLS)
        undo["dupes"] = [tuple(r) for r in conn.execute(
            f"SELECT {', '.join(cols)} FROM equipment "
            f"WHERE id IN ({','.join('?' * len(doomed))})", doomed)]
        conn.execute(f"DELETE FROM equipment WHERE id IN ({','.join('?' * len(doomed))})", doomed)
        print(f"장비 중복 {len(doomed):,}행 삭제")

    if lic:
        undo["license"] = [tuple(r) for r in lic]
        conn.executemany(
            "UPDATE equipment SET license_no = NULL, "
            # 근거가 사라졌으므로 허가번호 기반 등급은 유지할 수 없다
            "manufacturer_confidence = CASE WHEN manufacturer IS NULL THEN NULL "
            "                               ELSE '미확인' END WHERE id = ?",
            [(r[0],) for r in lic])
        print(f"license_no {len(lic):,}행 비움")

    if guessed:
        undo["guessed"] = [tuple(r) for r in guessed]
        conn.executemany(
            "UPDATE equipment SET manufacturer = NULL, manufacturer_confidence = NULL, "
            "manufacturer_synced_at = NULL WHERE id = ?", [(r[0],) for r in guessed])
        print(f"'추정' 제조사 {len(guessed):,}행 제거")

    if demote:
        undo["demote"] = [tuple(r) for r in demote]
        conn.executemany("UPDATE equipment SET manufacturer_confidence = '미확인' WHERE id = ?",
                         [(r[0],) for r in demote])
        print(f"'미확인' 강등 {len(demote):,}행")

    with open(UNDO_PATH, "w", encoding="utf-8") as f:
        json.dump(undo, f, ensure_ascii=False)
    print(f"되돌리기 기록: {UNDO_PATH}")

    conn.commit()
    conn.execute("ANALYZE")
    conn.commit()
    report(conn)
    return 0


def report(conn):
    q = lambda s: conn.execute(s).fetchone()[0]
    print("\n[반영 후]")
    print(f"  hospitals {q('SELECT COUNT(*) FROM hospitals'):,}행 · "
          f"좌표 없음 {q('SELECT COUNT(*) FROM hospitals WHERE lat IS NULL'):,}")
    print(f"  equipment {q('SELECT COUNT(*) FROM equipment'):,}행 · "
          f"license_no 보유 {q('SELECT COUNT(*) FROM equipment WHERE license_no IS NOT NULL'):,}")
    print("  제조사 등급별:")
    for k, n in conn.execute(
        "SELECT COALESCE(manufacturer_confidence, '(없음)'), COUNT(*) FROM equipment "
        "GROUP BY 1 ORDER BY 2 DESC"
    ):
        print(f"    {k:8s} {n:,}")
    left = q("SELECT COUNT(*) FROM equipment WHERE manufacturer_confidence = '추정'")
    print(f"  '추정' 잔여 {left}행 (0이어야 정상)")


if __name__ == "__main__":
    raise SystemExit(main())
