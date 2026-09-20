"""심평원 '의료장비 상세 현황'을 odcloud API로 연도별 전체 분류 적재 (2022~2025).

왜 필요한가:
  DB의 2019~2024년은 사내 레거시 경로로 들어와 **6개 분류(us/xray/ct/mri/bmd/carm)뿐**이고,
  2025년만 심평원 원본 전체(196분류)가 들어 있다. 이 상태로 연도별 추이를 그리면
  "2025년에 장비가 갑자기 10배로 늘어난" 가짜 추세가 나온다.
  odcloud가 2022~2025를 전 분류로 제공하므로, 2022~2024를 마저 채워 추세를 실제와 맞춘다.

API (인증키는 다른 심평원 API와 동일한 data.go.kr 일반 인증키):
  https://api.odcloud.kr/api/15051055/v1/{uddi}
  perPage 최대 5000 (10000은 빈 응답), page 1부터
  필드: 암호화된 요양기호, 요양기관명, 요양종별, 시도명, 시군구명,
        장비대분류명/코드, 장비세분류명/코드, 모델명, 장비허가번호, 장비수
  ※ 2022년 데이터에는 '암호화된 요양기호'가 없어 병원 매칭이 불가능하다 → 기본 대상에서 제외한다.

적재 규칙:
  - ykiho로 hospitals에 매칭되는 행만 넣는다(신규 병원 삽입은 하지 않는다).
  - 해당 연도에 이미 있는 레거시 6분류 행은 **건드리지 않는다**(제조사 정보를 갖고 있다).
    레거시에 없는 분류만 추가한다 — import_hira_equipment_full.py 와 같은 원칙이다.
  - source='odcloud_{year}' 로 넣어 출처를 구분한다.
  - 장비허가번호는 정규화해서 license_no 에 저장(제조사 매핑에 쓰인다).

사용법:
  python backend/scripts/import_odcloud_equipment_years.py                    # dry-run
  python backend/scripts/import_odcloud_equipment_years.py --apply
  python backend/scripts/import_odcloud_equipment_years.py --apply --years 2023,2024
멱등: 재실행하면 같은 (연도, 기관, 분류, 모델)이 이미 있어 0건으로 끝난다.
"""
import argparse
import os
import re
import shutil
import sqlite3
import sys
import time

import requests

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BASE, "data.db")
PER_PAGE = 5000

# swagger: https://infuser.odcloud.kr/oas/docs?namespace=15051055/v1
UDDI = {
    2022: "uddi:0975f0ef-3c09-4357-832f-89c16f67bbe5",  # 요양기호 없음 → 매칭 불가
    2023: "uddi:49c0b232-acb6-49d0-956e-b020bc6ae67f",
    2024: "uddi:40cac454-a23b-42c6-b76c-d65e8d281f6e",
    2025: "uddi:25b42339-7385-4e41-a8e9-ad86e0f0b489",
}
DEFAULT_YEARS = [2023, 2024]  # 2022는 요양기호 없음. 2025는 아래 주석 참고.

# 2025년도 이 API 로 받을 수 있다(2026-09-20 확인: totalCount 711,808, `장비허가번호` 포함).
# 기본값에서 뺀 이유는 "API 에 없어서"가 아니라 **이미 source='hira_2025' 로 CSV 적재가
# 끝난 DB가 있어서**다. 그런 DB에 --years 2025 를 돌리면 아래 `existing` 중복 검사에
# (기관,분류,모델)이 걸려 대부분 건너뛴다 — 행이 늘지도, 기존 행에 허가번호가 붙지도 않는다.
#
# hira_2025 에 license_no 가 비어 있는 DB(예: 2026-09 기준 운영 서버)를 고치려면
# **CSV 를 옮길 필요 없이** 이렇게 한다:
#     DELETE FROM equipment WHERE source = 'hira_2025';
#     python scripts/import_odcloud_equipment_years.py --apply --years 2023,2024,2025
# 레거시 6분류(source='import')는 LEGACY_MAJOR/MINOR 로 걸러지므로 손상되지 않는다.

# 레거시 6분류와 같은 뜻의 장비대분류코드 — 이 분류는 기존 행을 살려두고 건너뛴다
LEGACY_MAJOR = {"B101", "B106", "B108", "B203", "B301"}
LEGACY_MINOR = {"B30203"}


def norm_license(s: str) -> str:
    s = re.sub(r"\s+", "", s or "")
    return re.sub(r"^(서울|부산|경인|대구|광주|대전)", "", s)


def load_key() -> str:
    env = os.path.join(BASE, ".env")
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            if line.startswith("HIRA_API_KEY"):
                return line.split("=", 1)[1].strip()
    return os.environ.get("HIRA_API_KEY", "")


def fetch(key: str, uddi: str, page: int):
    url = "https://api.odcloud.kr/api/15051055/v1/" + uddi
    r = requests.get(url, params={"serviceKey": key, "page": str(page),
                                  "perPage": str(PER_PAGE), "returnType": "JSON"}, timeout=120)
    r.raise_for_status()
    d = r.json()
    return d.get("data") or [], int(d.get("totalCount") or 0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true", help="실제 반영 (기본은 dry-run)")
    ap.add_argument("--years", default=",".join(str(y) for y in DEFAULT_YEARS))
    args = ap.parse_args()

    years = [int(y) for y in args.years.split(",") if y.strip()]
    key = load_key()
    if not key:
        print("HIRA_API_KEY 를 찾을 수 없습니다 (backend/.env)")
        return 1

    conn = sqlite3.connect(args.db)
    yk2id = {r[0]: r[1] for r in conn.execute(
        "SELECT ykiho, id FROM hospitals WHERE ykiho IS NOT NULL")}
    print("DB: " + args.db)
    print("hospitals ykiho 색인: {:,}".format(len(yk2id)))

    if args.apply:
        backup = args.db + ".bak_odcloud_" + str(int(time.time()))
        shutil.copy2(args.db, backup)
        print("백업 생성: " + backup)

    grand_new = 0
    for year in years:
        if year not in UDDI:
            print("  {}년: uddi 없음 — 건너뜀".format(year))
            continue

        # 이미 그 연도에 있는 (기관,분류,모델) — 멱등성 보장용
        existing = set(conn.execute(
            "SELECT hospital_id, category, model FROM equipment WHERE year = ?", (year,)))
        legacy_cats = {r[0] for r in conn.execute(
            "SELECT DISTINCT category FROM equipment WHERE year = ? AND source != ?",
            (year, "odcloud_" + str(year)))}

        _rows, total = fetch(key, UDDI[year], 1)
        pages = (total + PER_PAGE - 1) // PER_PAGE
        print("\n[{}년] 원본 {:,}행 · {}페이지 · 기존 분류 {}종".format(
            year, total, pages, len(legacy_cats)))

        new_rows, skip_legacy, skip_nomatch, skip_dup = [], 0, 0, 0
        t0 = time.time()
        for page in range(1, pages + 1):
            for attempt in range(3):
                try:
                    items, _ = fetch(key, UDDI[year], page)
                    break
                except Exception as e:
                    if attempt == 2:
                        print("\n  {}페이지 3회 실패: {}".format(page, type(e).__name__))
                        return 1
                    time.sleep(3)
            if not items:
                break
            for x in items:
                major = (x.get("장비대분류코드") or "").strip()
                minor = (x.get("장비세분류코드") or "").strip()
                if major in LEGACY_MAJOR or minor in LEGACY_MINOR:
                    skip_legacy += 1
                    continue
                yk = (x.get("암호화된 요양기호") or "").strip()
                hid = yk2id.get(yk)
                if not hid:
                    skip_nomatch += 1
                    continue
                model = (x.get("모델명") or "").strip()
                cat = major or minor
                if (hid, cat, model) in existing:
                    skip_dup += 1
                    continue
                existing.add((hid, cat, model))
                try:
                    cnt = int(float(x.get("장비수") or 0))
                except (TypeError, ValueError):
                    cnt = 0
                new_rows.append((hid, cat, year, model, cnt, "odcloud_" + str(year),
                                 (x.get("장비대분류명") or "").strip() or None,
                                 major or None,
                                 (x.get("장비세분류명") or "").strip() or None,
                                 norm_license(x.get("장비허가번호")) or None))
            if page % 20 == 0 or page == pages:
                sys.stdout.write("\r  {}/{} 페이지 · 신규 {:,} · {:.0f}초".format(
                    page, pages, len(new_rows), time.time() - t0))
                sys.stdout.flush()
        print()
        print("  기존분류 제외 {:,} · 미매칭기관 제외 {:,} · 중복 제외 {:,} · 신규 {:,}".format(
            skip_legacy, skip_nomatch, skip_dup, len(new_rows)))

        if args.apply and new_rows:
            conn.executemany(
                "INSERT INTO equipment (hospital_id, category, year, model, eq_count, source,"
                " category_name, category_code, subcategory_name, license_no)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)", new_rows)
            conn.commit()
            print("  반영 완료")
        grand_new += len(new_rows)

    print("\n합계 신규 {:,}행".format(grand_new))
    if not args.apply:
        print("[dry-run] 실제 반영하려면 --apply 를 붙이세요.")
        return 0

    print("\n연도별 분류 종수:")
    for y, n in conn.execute(
            "SELECT year, COUNT(DISTINCT category) FROM equipment GROUP BY year ORDER BY year"):
        print("   {}  {:>4}종".format(y, n))
    print("총 equipment: {:,}".format(
        conn.execute("SELECT COUNT(*) FROM equipment").fetchone()[0]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
