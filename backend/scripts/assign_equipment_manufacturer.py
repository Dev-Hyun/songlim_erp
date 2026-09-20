"""equipment(source='hira_2025')에 제조사를 붙인다 — 식약처 허가번호 대조.

왜 필요한가:
  심평원 '의료장비 상세 현황' 466K행에는 제조사가 없다(CSV에 컬럼 자체가 없다). 있는 건
  `장비허가번호`뿐인데 식약처 품목허가의 MEDDEV_ITEM_NO와 같은 체계라, 정규화해서 조인하면
  제조사가 나온다. equipment.license_no <-> mfds_device_items.license_no.

**근거는 허가번호뿐이다.** 모델명 문자열로 제조사를 맞히던 '추정' 단계와 2차 보강
스크립트(assign_manufacturer_pass2.py)는 2026-09-20에 제거했다 — 데이터 교차검증 보고서에서
실제 오류로 확인됐기 때문이다(예: `SONIMAGE HS1`을 Canon으로 붙였으나 식약처 허가
`수인15-4130호`는 KONICA MINOLTA). 허가번호로 못 찾는 행은 제조사를 비워 둔다.

신뢰도 등급 (manufacturer_confidence):
  확인   허가번호가 식약처에서 **제조사 한 곳**으로만 떨어진다. 허가번호는 품목 단위 고유번호라
         이 경우 제조사는 사실상 확정이다.
  유력   허가번호는 맞는데 그 번호 아래 **제조사가 여러 곳**이다(허가 승계/제조원 변경/복수 제조원).
         형명(TYPE_INFO)이 장비 모델명과 맞아떨어지는 쪽을 고르고, 그래도 안 갈리면 행수가 많은 쪽.
         번호는 확실하지만 업체 지목에 판단이 들어갔으므로 한 단계 낮춘다.
  미확인 허가번호는 조회되지만 그 번호의 식약처 품목이 이 장비분류와 안 맞는다
         (= 심평원 원본 CSV의 허가번호 칸이 틀렸다). 값은 남기되 믿지 말라는 표시다.
         원본이 틀린 것이라 우리가 고칠 근거가 없어 자동 교정하지 않는다. build_suspect_licenses 참고.

  manufacturer_synced_at 에는 식약처 데이터를 받아온 날짜를 넣는다(근거 표기용 대조일).

건드리지 않는 것:
  source='import' 레거시 510K행의 manufacturer는 사내에서 정리해 온 값이고 제조사 드롭다운이
  그 값에 의존한다. **이 스크립트는 source='hira_2025' 행만 UPDATE한다.**

멱등: 재실행하면 같은 값이 다시 계산돼 변경 0행으로 끝난다.

사용법:
  python backend/scripts/assign_equipment_manufacturer.py          # dry-run (매칭률만 출력)
  python backend/scripts/assign_equipment_manufacturer.py --apply  # 백업 뜨고 반영
"""
import argparse
import collections
import os
import re
import shutil
import sqlite3
import sys
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BASE, "data.db")
# 심평원 원본에서 들어온 모든 출처. 레거시 source='import' 는 사내 정리값이라 제외한다.
SOURCE_LIKE = ("hira_%", "odcloud_%")
BATCH = 20_000

# 업체명 표기 차이를 흡수해 '같은 제조사인가'만 판정하기 위한 키. 표시값은 원문 그대로 쓴다.
CORP_SUFFIX = re.compile(
    r"(주식회사|유한회사|㈜|\(주\)|\(유\)|co\.?,?\s*ltd\.?|company|corporation|corp\.?|"
    r"limited|ltd\.?|inc\.?|gmbh|llc|co\.?,)",
    re.IGNORECASE,
)
NON_WORD = re.compile(r"[^0-9a-z가-힣]")
# '78-1512외 902건' -> '78-1512'
TYPE_TAIL = re.compile(r"외\s*\d+\s*건\s*$")
HAS_ALPHA = re.compile(r"[a-z가-힣]")


def maker_key(name: str) -> str:
    return NON_WORD.sub("", CORP_SUFFIX.sub("", name.lower()))


def model_key(model: str) -> str:
    return NON_WORD.sub("", model.lower())


def type_tokens(type_info: str):
    """TYPE_INFO를 형명 토큰들로 쪼갠다. 너무 짧거나 숫자뿐인 토큰은 오매칭이 나서 버린다."""
    for part in re.split(r"[,;/]|\s{2,}", type_info):
        part = TYPE_TAIL.sub("", part).strip()
        k = model_key(part)
        if len(k) >= 4 and HAS_ALPHA.search(k):
            yield k


def build_license_index(conn):
    """license_no -> {maker_key: [행수, 표시명 Counter, 형명 토큰 set]}"""
    idx = collections.defaultdict(lambda: collections.defaultdict(
        lambda: {"n": 0, "names": collections.Counter(), "types": set()}))
    for lic, maker, client, tinfo in conn.execute(
        "SELECT license_no, maker_name, client_name, type_info FROM mfds_device_items"
    ):
        name = (maker or client or "").strip()
        if not name:
            continue
        e = idx[lic][maker_key(name)]
        e["n"] += 1
        e["names"][name] += 1
        if tinfo:
            e["types"].update(type_tokens(tinfo))
    return idx


def build_suspect_licenses(conn):
    """원본 CSV에서 허가번호가 잘못 적힌 것으로 보이는 번호 집합.

    식약처가 품목 1종으로 확정한 번호인데 우리 데이터는 그 번호를 2종 이상의 장비분류에
    쓰고 있다면, 번호가 장비와 안 맞는다는 뜻이다(보고서 E3). 제조사는 조회되지만 그 값을
    믿을 수 없으므로 등급을 '미확인'으로 내린다. 값 자체는 원본이 틀린 것이라 고칠 근거가 없다.
    """
    return {r[0] for r in conn.execute(
        "WITH single AS (SELECT license_no FROM mfds_device_items "
        "                GROUP BY 1 HAVING COUNT(DISTINCT item_name) = 1) "
        "SELECT e.license_no FROM equipment e JOIN single s ON s.license_no = e.license_no "
        "WHERE e.license_no IS NOT NULL "
        "GROUP BY e.license_no HAVING COUNT(DISTINCT e.category_name) >= 2"
    )}


def resolve(lic, model, lic_idx, suspect):
    """(제조사명, 등급) 또는 None. 근거는 **허가번호뿐이다** — 모델명 추측은 쓰지 않는다."""
    cands = lic_idx.get(lic) if lic else None
    if not cands:
        return None
    if len(cands) == 1:
        e = next(iter(cands.values()))
        name, grade = e["names"].most_common(1)[0][0], "확인"
    else:
        # 허가번호 하나에 업체가 여럿 — 형명이 모델명과 맞는 쪽을 고른다
        mk = model_key(model or "")
        hit = [e for e in cands.values() if mk and mk in e["types"]]
        pool = hit if len(hit) == 1 else list(cands.values())
        best = max(pool, key=lambda e: e["n"])
        name, grade = best["names"].most_common(1)[0][0], "유력"
    return (name, "미확인") if lic in suspect else (name, grade)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true", help="실제 반영 (기본은 dry-run)")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    conn = sqlite3.connect(args.db, timeout=60)
    n_mfds = conn.execute("SELECT COUNT(*) FROM mfds_device_items").fetchone()[0]
    if not n_mfds:
        print("mfds_device_items 가 비어 있습니다. 먼저 sync_mfds_device_makers.py --apply 를 돌리세요.")
        return 1
    synced_at = (conn.execute("SELECT MAX(updated_at) FROM mfds_device_items").fetchone()[0] or "")[:10]
    print(f"DB: {args.db}\n식약처 원장 {n_mfds:,}행 · 대조일 {synced_at}")

    t0 = time.time()
    lic_idx = build_license_index(conn)
    suspect = build_suspect_licenses(conn)
    print(f"허가번호 색인 {len(lic_idx):,}개 · 품목계열이 어긋나는 허가번호 {len(suspect):,}개 "
          f"({time.time() - t0:.0f}초)")

    rows = conn.execute(
        "SELECT id, license_no, model, manufacturer, manufacturer_confidence "
        "FROM equipment WHERE source LIKE ? OR source LIKE ?", SOURCE_LIKE
    ).fetchall()
    total = len(rows)

    updates, grades = [], collections.Counter()
    makers, unmatched_models = set(), collections.Counter()
    changed = 0
    for eid, lic, model, cur_mfr, cur_conf in rows:
        got = resolve(lic, model, lic_idx, suspect)
        if not got:
            grades["미매칭"] += 1
            unmatched_models[model or "(모델명 없음)"] += 1
            continue
        name, grade = got
        grades[grade] += 1
        makers.add(name)
        if name != cur_mfr or grade != cur_conf:
            changed += 1
        updates.append((name, grade, synced_at, eid))

    if args.apply:
        backup = f"{args.db}.bak_eq_maker_{int(time.time())}"
        shutil.copy2(args.db, backup)
        print(f"백업 생성: {backup}")
        for i in range(0, len(updates), BATCH):
            conn.executemany(
                "UPDATE equipment SET manufacturer = ?, manufacturer_confidence = ?, "
                "manufacturer_synced_at = ? WHERE id = ?", updates[i:i + BATCH])
        conn.commit()
        conn.execute("ANALYZE")
        conn.commit()

    matched = len(updates)
    print(f"\n심평원 원본 출처(hira_*, odcloud_*) {total:,}행")
    print(f"  제조사 부여 {matched:,} ({matched / total * 100:.1f}%) · 미매칭 {grades['미매칭']:,} "
          f"({grades['미매칭'] / total * 100:.1f}%)")
    for g in ("확인", "유력", "미확인"):
        print(f"    {g} {grades[g]:,} ({grades[g] / total * 100:.1f}%)")
    print(f"  고유 제조사 {len(makers):,}종 · 이번 실행으로 값이 바뀌는 행 {changed:,}")

    print("\n미매칭 상위 모델 20:")
    for m, n in unmatched_models.most_common(20):
        print(f"  {n:6,}  {m}")

    if not args.apply:
        print("\n[dry-run] 실제 반영하려면 --apply 를 붙이세요.")
        return 0

    legacy = conn.execute(
        "SELECT COUNT(*) FROM equipment WHERE source = 'import' AND manufacturer IS NULL"
    ).fetchone()[0]
    print(f"\n반영 완료. source='import' 중 manufacturer NULL: {legacy}행 (0이어야 정상 — 레거시 무손상)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
