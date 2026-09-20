"""심평원 '의료장비 상세 현황'(20251231 스냅샷, 195 장비대분류)을 equipment에 임포트한다.

왜 필요한가:
  지금까지 equipment에는 6종(us/xray/ct/mri/bmd/carm)만 들어 있었다. 원본 CSV는 195종 전부를
  담고 있어서, 치과·한방·물리치료·검체검사 장비까지 한 번에 볼 수 있게 된다.

중복을 만들지 않는 방법 — 조사해서 확인한 사실:
  기존 2025년 행은 **바로 이 CSV의 6개 장비대분류와 같은 내용**이다. (세분류 단위로 대조했고
  모델명·대수가 행 단위로 일치한다. 아래는 CSV 행수 vs DB 2025년 행수)
      B101 일반엑스선촬영장치   22,991 = xray  22,991
      B108 전산화단층촬영장치    2,370 = ct     2,370
      B301 자기공명영상진단기    1,940 = mri    1,940
      B203 골밀도검사기        (요양기호 매칭분) 11,006 = bmd  11,006
      B106 C-Arm형 엑스선장치  (요양기호 매칭분)  6,429 = carm  6,429
      B30203 범용초음파영상진단기 36,731 = us   36,731
  따라서 **이미 들어 있는 분류는 CSV에서 제외하고 임포트한다**(SKIP_MAJOR / SKIP_MINOR).
  기존 행은 제조사(manufacturer)를 갖고 있는데 이 CSV에는 제조사 컬럼이 없으므로, 기존 행을
  새 데이터로 갈아엎으면 제조사 정보를 잃는다. 그래서 '기존 유지 + 나머지 추가'를 택했다.

  예외: B302(초음파영상진단기) 중 안과전용(B30201)·뇌혈류측정전용(B30202)은 기존 us에 없다.
  이 둘을 us에 합치면 us의 2019~2025 연도별 추이가 2025년에만 튀므로, 세분류코드를 그대로
  category로 쓰는 별도 분류로 넣는다.

장비허가번호: CSV의 '장비허가번호'(100% 채워져 있다)를 정규화해 equipment.license_no에 넣는다.
  식약처 품목허가(mfds_device_items.license_no)와 같은 체계라, 이 값이 제조사를 붙이는 유일한 키다.
  정규화 = 공백 제거 + 지방청 접두어(서울|부산|경인|대구|광주|대전) 제거.
  이미 들어와 있는 hira_2025 행에 이 값만 채우려면 --license-only 로 돌린다(재임포트 없이 UPDATE).

매칭: CSV의 '암호화된 요양기호' = hospitals.ykiho. 우리 DB에 없는 기관은 건너뛴다(신규 병원 삽입 금지).

멱등성: --apply 시 기존 source='hira_2025' 행을 전부 지우고 다시 넣는다. 재실행해도 중복이 안 생긴다.
2019~2024년 행과 source='import'/'manual' 행은 절대 건드리지 않는다.

사용법:
  backend/venv/Scripts/python.exe backend/scripts/import_hira_equipment_full.py            # dry-run
  backend/venv/Scripts/python.exe backend/scripts/import_hira_equipment_full.py --apply    # 백업 뜨고 반영
  backend/venv/Scripts/python.exe backend/scripts/import_hira_equipment_full.py --license-only --apply
"""
import argparse
import collections
import csv
import os
import re
import shutil
import sqlite3
import sys
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BASE, "data.db")
DEFAULT_CSV = os.path.join(
    os.path.dirname(os.path.dirname(BASE)),
    "건강보험심사평가원_의료장비 상세 현황_20251231 (1).csv",
)

SNAPSHOT_YEAR = 2025  # 파일명 20251231 = 2025년 말 기준
SOURCE = "hira_2025"
ENCODING = "cp949"
CHUNK = 20_000

# 이미 DB에 같은 내용이 들어 있는 장비대분류 — 통째로 제외
SKIP_MAJOR = {
    "B101": "xray",
    "B106": "carm",
    "B108": "ct",
    "B203": "bmd",
    "B301": "mri",
}
# 이미 DB에 들어 있는 장비세분류 — 대분류는 살리고 이 세분류만 제외
SKIP_MINOR = {"B30203": "us"}
# 대분류를 쪼개서 세분류코드를 category로 쓰는 예외 (위 SKIP_MINOR 때문에 생긴 나머지)
SPLIT_MINOR = {"B30201", "B30202"}

COLS = (
    "hospital_id, category, category_name, category_code, subcategory_name, "
    "year, manufacturer, model, model_series, eq_count, source, license_no"
)
INSERT_SQL = f"INSERT INTO equipment ({COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"

# 식약처 허가번호의 지방청 접두어. 심평원 CSV는 접두어 없이('수허13-302호'), 식약처는 붙여서
# ('서울 수신 05-378 호') 주기 때문에 양쪽을 같은 모양으로 접어야 조인이 된다.
LICENSE_PREFIX = re.compile(r"^(서울|부산|경인|대구|광주|대전)")


def norm_license(v: str) -> str | None:
    """'서울 수신 05-378 호' -> '수신05-378호', '수허13-302호' -> 그대로."""
    s = re.sub(r"\s+", "", v or "")
    s = LICENSE_PREFIX.sub("", s)
    return s or None


def pick_category(major: str, minor: str, row: dict) -> tuple[str, str]:
    """(category, category_name) — SPLIT_MINOR만 세분류코드를 category로 쓴다."""
    if minor in SPLIT_MINOR:
        return minor, (row["장비세분류명"] or "").strip()
    return major, (row["장비대분류명"] or "").strip()


def load_ykiho_map(conn: sqlite3.Connection) -> dict[str, int]:
    return {
        y: i
        for y, i in conn.execute(
            "SELECT ykiho, id FROM hospitals WHERE ykiho IS NOT NULL AND ykiho <> ''"
        )
    }


def to_count(v: str) -> int:
    try:
        n = int((v or "").strip())
    except ValueError:
        return 1
    return n if n > 0 else 1


def backfill_license(conn: sqlite3.Connection, csv_path: str, yk2h: dict[str, int], apply: bool) -> int:
    """이미 들어와 있는 source='hira_2025' 행에 license_no만 채운다 (재임포트 없이 UPDATE).

    같은 (hospital_id, category, model)을 키로 CSV 쪽 허가번호를 모아 DB 행에 하나씩 나눠 준다.
    실측: 키 단위 행수가 CSV와 DB에서 완전히 일치한다(불일치 키 0개). 한 키에 서로 다른 허가번호가
    2개 이상 걸리는 경우(8,144키/17,851행)는 나머지 컬럼이 전부 같아 행을 구분할 근거가 없으므로
    순서대로 배분한다 — 제조사 집계 결과는 어느 배분을 써도 같다.
    """
    pool: dict[tuple, list[str | None]] = collections.defaultdict(list)
    for row in csv.DictReader(open(csv_path, encoding=ENCODING, newline="")):
        major = (row["장비대분류코드"] or "").strip()
        minor = (row["장비세분류코드"] or "").strip()
        if major in SKIP_MAJOR or minor in SKIP_MINOR:
            continue
        hid = yk2h.get(row["암호화된 요양기호"])
        if hid is None:
            continue
        category, _ = pick_category(major, minor, row)
        model = (row["모델명"] or "").strip() or None
        pool[(hid, category, model)].append(norm_license(row["장비허가번호"]))

    updates: list[tuple] = []
    unmatched = 0
    for eid, hid, category, model in conn.execute(
        "SELECT id, hospital_id, category, model FROM equipment WHERE source = ?", (SOURCE,)
    ):
        bucket = pool.get((hid, category, model))
        if not bucket:
            unmatched += 1
            continue
        lic = bucket.pop()
        if lic:
            updates.append((lic, eid))

    if apply:
        conn.executemany("UPDATE equipment SET license_no = ? WHERE id = ?", updates)
        conn.commit()

    total = conn.execute("SELECT COUNT(*) FROM equipment WHERE source = ?", (SOURCE,)).fetchone()[0]
    filled = conn.execute(
        "SELECT COUNT(*) FROM equipment WHERE source = ? AND license_no IS NOT NULL", (SOURCE,)
    ).fetchone()[0]
    print(f"CSV 키 {len(pool):,}개 · 갱신 대상 {len(updates):,}행 · CSV에 없는 행 {unmatched:,}")
    print("  (CSV에 없는 행 = 2025-12-31 스냅샷 이후 요양기호가 재발급된 기관)")
    if apply:
        print(f"source='{SOURCE}' {total:,}행 중 license_no 보유 {filled:,} ({filled / total * 100:.2f}%)")
    else:
        print("[dry-run] 실제 반영하려면 --apply 를 붙이세요.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--csv", default=DEFAULT_CSV)
    ap.add_argument("--apply", action="store_true", help="실제 반영 (기본은 dry-run)")
    ap.add_argument("--limit", type=int, default=0, help="CSV 앞쪽 N행만 처리 (점검용)")
    ap.add_argument("--license-only", action="store_true",
                    help="재임포트 없이 기존 hira_2025 행의 license_no만 채운다")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    if not os.path.exists(args.csv):
        print(f"CSV를 찾을 수 없습니다: {args.csv}")
        return 1

    conn = sqlite3.connect(args.db)
    yk2h = load_ykiho_map(conn)
    print(f"DB: {args.db}")
    print(f"CSV: {args.csv}")
    print(f"hospitals.ykiho 보유: {len(yk2h):,}")

    if args.apply:
        backup = f"{args.db}.bak_hira_eq_full_{int(time.time())}"
        shutil.copy2(args.db, backup)
        print(f"백업 생성: {backup}")

    if args.license_only:
        return backfill_license(conn, args.csv, yk2h, args.apply)

    if args.apply:
        deleted = conn.execute("DELETE FROM equipment WHERE source = ?", (SOURCE,)).rowcount
        print(f"기존 source='{SOURCE}' 행 삭제(멱등성): {deleted:,}")

    read = skipped_existing = 0
    seen_yk: set[str] = set()
    unmatched_yk: set[str] = set()
    unmatched_rows = 0
    cats: collections.Counter = collections.Counter()
    buf: list[tuple] = []
    inserted = 0
    t0 = time.time()

    with open(args.csv, encoding=ENCODING, newline="") as f:
        for row in csv.DictReader(f):
            read += 1
            if args.limit and read > args.limit:
                read -= 1
                break

            major = (row["장비대분류코드"] or "").strip()
            minor = (row["장비세분류코드"] or "").strip()
            if major in SKIP_MAJOR or minor in SKIP_MINOR:
                skipped_existing += 1
                continue

            ykiho = row["암호화된 요양기호"]
            seen_yk.add(ykiho)
            hid = yk2h.get(ykiho)
            if hid is None:
                unmatched_yk.add(ykiho)
                unmatched_rows += 1
                continue

            category, category_name = pick_category(major, minor, row)
            cats[category] += 1
            buf.append(
                (
                    hid,
                    category,
                    category_name,
                    major,
                    (row["장비세분류명"] or "").strip() or None,
                    SNAPSHOT_YEAR,
                    None,  # manufacturer — 이 CSV에는 제조사 컬럼이 없다
                    (row["모델명"] or "").strip() or None,
                    None,  # model_series — X-ray 전용이라 여기선 안 쓴다
                    to_count(row["장비수"]),
                    SOURCE,
                    norm_license(row["장비허가번호"]),
                )
            )
            if len(buf) >= CHUNK:
                inserted += len(buf)
                if args.apply:
                    conn.executemany(INSERT_SQL, buf)
                buf.clear()
                sys.stdout.write(f"\r  읽음 {read:,} · 준비 {inserted:,}")
                sys.stdout.flush()

    if buf:
        inserted += len(buf)
        if args.apply:
            conn.executemany(INSERT_SQL, buf)
        buf.clear()
    print(f"\r  읽음 {read:,} · 준비 {inserted:,}          ")

    if args.apply:
        conn.commit()  # 트랜잭션 한 번에 커밋 — 행마다 커밋하면 몇 시간 걸린다
        conn.execute("ANALYZE")
        conn.commit()

    n_yk = len(seen_yk)
    n_bad = len(unmatched_yk)
    print()
    print(f"CSV 행            : {read:,}")
    print(f"  기존 분류라 제외 : {skipped_existing:,}  (대분류 {sorted(SKIP_MAJOR)} + 세분류 {sorted(SKIP_MINOR)})")
    print(f"  ykiho 미매칭 제외: {unmatched_rows:,}")
    print(f"  임포트 대상      : {inserted:,}")
    print(f"요양기관(제외분류 외): {n_yk:,} · 매칭 {n_yk - n_bad:,} ({(n_yk - n_bad) / n_yk * 100:.1f}%) · "
          f"미매칭 {n_bad:,} ({n_bad / n_yk * 100:.1f}%)")
    print(f"신규 category 종류 : {len(cats):,}")
    print(f"소요: {time.time() - t0:.1f}초")

    if not args.apply:
        print("\n[dry-run] 실제 반영하려면 --apply 를 붙이세요.")
        return 0

    total = conn.execute("SELECT COUNT(*) FROM equipment").fetchone()[0]
    ncat = conn.execute("SELECT COUNT(DISTINCT category) FROM equipment").fetchone()[0]
    dup = conn.execute(
        """SELECT COUNT(*) FROM (
               SELECT hospital_id FROM equipment WHERE year = ?
               GROUP BY hospital_id, category
               HAVING COUNT(DISTINCT source) > 1)""",
        (SNAPSHOT_YEAR,),
    ).fetchone()[0]
    print(f"\n반영 완료. equipment 총 {total:,}행 · category {ncat}종")
    print(f"같은 (기관,분류,{SNAPSHOT_YEAR}년)을 두 source가 함께 갖는 경우: {dup} (0이어야 정상)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
