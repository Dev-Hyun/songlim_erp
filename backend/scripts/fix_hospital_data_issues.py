"""영업지도 데이터 잔여 이슈 일괄 정리 (2026-09-18, 사용자가 "임의로 정해서 전부 설정" 지시).

전수조사에서 근거가 부족해 보류했던 항목들을 실제 데이터를 확인하고 아래 기준으로 처리한다.

[1] 요양기호 중복 3쌍 (6행)
    같은 ykiho·같은 시군구·같은 개설일 = 확실한 동일 기관의 이중 등록.
    '(사)', '(스카이메디)' 같은 접두어가 붙은 쪽이 표시명으로 나쁘므로 **깨끗한 이름 쪽을 남기고**,
    없어지는 쪽의 장비는 (category, year, model, manufacturer) 기준으로 중복을 걸러 남는 쪽으로 옮긴다.
    → 장비를 통째로 옮기면 같은 장비가 두 번 잡혀 보유 대수가 부풀기 때문에 중복 제거가 필요하다.

[2] 인천 신설구 4종 (73행)
    서해구/검단구/영종구/제물포구는 실제 행정구역 개편으로 생긴 구다. 어느 기존 구에서 갈라졌는지
    매핑할 근거가 데이터에 없으므로 **통합하지 않고**, 인천의 다른 구가 전부 '인천○구' 형태인 것에
    맞춰 접두어만 붙인다(드롭다운 표기 일관성).

[3] 세종 시군구에 도로명이 들어간 행
    세종은 단층제라 자치구가 없다. '한누리대로', '보듬3로'처럼 **도로명인 것만** '세종시'로 돌린다.
    조치원읍·연서면·금남면·장군면 같은 **실제 읍·면은 그대로 둔다**(행정 단위이고 정보 손실이 없다).
    도로명 정보는 이미 address 컬럼에 들어 있으므로 잃는 게 없다.

처리하지 않기로 한 것(근거를 남긴다):
  - 이름은 있고 지역만 비어 있는 3행(나중환신경외과의원 등): 장비가 붙어 있어 삭제하면 고아가 된다.
    이름으로 검색은 되고 좌표가 없어 지도에는 안 뜨므로 그대로 둔다.
  - 주소 없음 4,111행: 그중 3,507행은 ykiho가 없어 심평원에 존재하지 않는 기관(주로 동물병원)이다.
  - 주소는 있는데 좌표가 없는 219행: 서버용 지오코딩 키가 없어 채울 수 없다.
    NCP 지오코딩 키가 생기면 채울 수 있다.

사용법:
  python backend/scripts/fix_hospital_data_issues.py            # dry-run
  python backend/scripts/fix_hospital_data_issues.py --apply    # 백업 뜨고 반영
멱등하다. 재실행하면 0건으로 끝난다.
"""
import argparse
import json
import os
import re
import shutil
import sqlite3
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BASE, "data.db")
UNDO_PATH = os.path.join(BASE, "hospital_fix_undo.json")

INCHEON_NEW = ["서해구", "검단구", "영종구", "제물포구"]
ROAD_SUFFIX = re.compile(r"(로|길|대로|번길)\d*$")


def plan_dupes(conn):
    """ykiho 중복 그룹 -> (남길 id, 없앨 id). 괄호 접두어가 없는 쪽을 남긴다."""
    out = []
    for (yk,) in conn.execute(
        "SELECT ykiho FROM hospitals WHERE ykiho IS NOT NULL GROUP BY ykiho HAVING COUNT(*) > 1"
    ).fetchall():
        rows = conn.execute("SELECT id, name FROM hospitals WHERE ykiho = ?", (yk,)).fetchall()
        # 괄호로 시작하지 않는 이름 우선, 그다음 짧은 이름 우선
        rows.sort(key=lambda r: (r[1].strip().startswith("("), len(r[1])))
        keep = rows[0][0]
        for rid, _ in rows[1:]:
            out.append((keep, rid))
    return out


def plan_incheon(conn):
    ids = {}
    for sgg in INCHEON_NEW:
        rows = [r[0] for r in conn.execute(
            "SELECT id FROM hospitals WHERE sigungu = ? AND sido LIKE '%인천%'", (sgg,))]
        if rows:
            ids[sgg] = ("인천" + sgg, rows)
    return ids


def plan_sejong(conn):
    ids = []
    for rid, sgg in conn.execute(
        "SELECT id, sigungu FROM hospitals WHERE sido LIKE '%세종%' AND sigungu IS NOT NULL"
    ):
        if sgg != "세종시" and ROAD_SUFFIX.search(sgg):
            ids.append((rid, sgg))
    return ids


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    dupes = plan_dupes(conn)
    incheon = plan_incheon(conn)
    sejong = plan_sejong(conn)

    print(f"DB: {args.db}")
    print(f"[1] 요양기호 중복 병합: {len(dupes)}쌍")
    for keep, drop in dupes:
        kn = conn.execute("SELECT name FROM hospitals WHERE id=?", (keep,)).fetchone()[0]
        dn = conn.execute("SELECT name FROM hospitals WHERE id=?", (drop,)).fetchone()[0]
        ne = conn.execute("SELECT COUNT(*) FROM equipment WHERE hospital_id=?", (drop,)).fetchone()[0]
        print(f"    남김 [{keep}] {kn}  <-  버림 [{drop}] {dn} (장비 {ne}건 이전)")
    print(f"[2] 인천 신설구 접두어: {sum(len(v[1]) for v in incheon.values())}행")
    for sgg, (canon, ids) in incheon.items():
        print(f"    {sgg} -> {canon}: {len(ids)}행")
    print(f"[3] 세종 도로명 -> 세종시: {len(sejong)}행")
    for _rid, sgg in sejong[:8]:
        print(f"    {sgg}")

    total = len(dupes) + sum(len(v[1]) for v in incheon.values()) + len(sejong)
    print(f"\n합계 {total}건 변경 예정")
    if total == 0:
        print("변경할 항목이 없습니다 (이미 정리됨).")
        return 0
    if not args.apply:
        print("[dry-run] 실제 반영하려면 --apply 를 붙이세요.")
        return 0

    backup = f"{args.db}.bak_hospital_fix_{int(time.time())}"
    shutil.copy2(args.db, backup)
    print(f"백업 생성: {backup}")

    undo = {"dupes": [], "incheon": [], "sejong": [(r, s) for r, s in sejong]}
    moved = dropped = 0
    for keep, drop in dupes:
        have = {tuple(r) for r in conn.execute(
            "SELECT category, year, model, manufacturer FROM equipment WHERE hospital_id=?", (keep,))}
        for eid, cat, yr, mdl, mfr in conn.execute(
            "SELECT id, category, year, model, manufacturer FROM equipment WHERE hospital_id=?", (drop,)).fetchall():
            if (cat, yr, mdl, mfr) in have:
                conn.execute("DELETE FROM equipment WHERE id=?", (eid,))
                dropped += 1
            else:
                conn.execute("UPDATE equipment SET hospital_id=? WHERE id=?", (keep, eid))
                have.add((cat, yr, mdl, mfr))
                moved += 1
        row = conn.execute("SELECT name, sido, sigungu, ykiho FROM hospitals WHERE id=?", (drop,)).fetchone()
        undo["dupes"].append({"keep": keep, "dropped_id": drop, "row": row})
        conn.execute("DELETE FROM hospitals WHERE id=?", (drop,))

    for sgg, (canon, ids) in incheon.items():
        undo["incheon"].append({"from": sgg, "to": canon, "ids": ids})
        conn.execute("UPDATE hospitals SET sigungu=? WHERE sido LIKE '%인천%' AND sigungu=?", (canon, sgg))

    for rid, _sgg in sejong:
        conn.execute("UPDATE hospitals SET sigungu='세종시' WHERE id=?", (rid,))

    prev = json.load(open(UNDO_PATH, encoding="utf-8")) if os.path.exists(UNDO_PATH) else []
    json.dump(prev + [undo], open(UNDO_PATH, "w", encoding="utf-8"), ensure_ascii=False)
    conn.commit()

    print(f"되돌리기용: {UNDO_PATH}")
    print(f"완료 — 병합 {len(dupes)}쌍 (장비 {moved}건 이전, 중복 {dropped}건 제거), "
          f"인천 {sum(len(v[1]) for v in incheon.values())}행, 세종 {len(sejong)}행")
    print(f"총 병원: {conn.execute('SELECT COUNT(*) FROM hospitals').fetchone()[0]:,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
