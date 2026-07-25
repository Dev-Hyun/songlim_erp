"""저장소 루트의 "소모품 카탈로그.xlsx"(medioc.com 스크래핑 결과, 6,345건)를
supply_catalog 테이블에 적재한다.

- category ← 대분류, sub_category ← 중분류 (소분류는 상품명/규격에 이미 반영돼 있어 생략)
- code ← medioc 상품번호 (재실행 시 이미 들어간 code는 건너뛰어 중복 삽입 방지)
- unit_price ← 실제 가격 정보가 없어 임의 배정 (500~50,000원, 100원 단위). 추후 담당자가
  admin 카탈로그 화면에서 실제 판매가로 조정해야 함.
- 실행 전 backend/backups/ 에 sqlite backup API로 스냅샷을 먼저 남긴다 (scripts/backup_db.py와 동일 방식).

사용법: cd backend && venv/Scripts/python scripts/import_medioc_supply_catalog.py
"""
import os
import random
import sqlite3
from datetime import datetime, timezone

import openpyxl

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_DIR = os.path.dirname(BACKEND_DIR)
DB_PATH = os.path.join(BACKEND_DIR, "data.db")
XLSX_PATH = os.path.join(REPO_DIR, "소모품 카탈로그.xlsx")
BACKUP_DIR = os.path.join(BACKEND_DIR, "backups")

PRICE_MIN, PRICE_MAX, PRICE_STEP = 500, 50000, 100


def backup_db() -> str:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dest_path = os.path.join(BACKUP_DIR, f"data_{ts}_pre_medioc_import.db")
    src = sqlite3.connect(DB_PATH)
    dest = sqlite3.connect(dest_path)
    with dest:
        src.backup(dest)
    src.close()
    dest.close()
    return dest_path


def now_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")


def random_price() -> int:
    return random.randint(PRICE_MIN // PRICE_STEP, PRICE_MAX // PRICE_STEP) * PRICE_STEP


def main():
    if not os.path.exists(XLSX_PATH):
        raise SystemExit(f"소스 파일을 찾을 수 없습니다: {XLSX_PATH}")

    backup_path = backup_db()
    print(f"백업 완료: {backup_path}")

    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(min_row=2, values_only=True))  # 대분류,중분류,제조사,소모품이름,규격,단위,상품번호
    wb.close()

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("SELECT code FROM supply_catalog WHERE code IS NOT NULL")
    existing_codes = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT COALESCE(MAX(sort_order), -1) FROM supply_catalog")
    sort_order = cur.fetchone()[0] + 1

    seen_codes = set()
    to_insert = []
    skipped_dupe = 0
    skipped_bad = 0
    for row in rows:
        if not row or len(row) < 7:
            skipped_bad += 1
            continue
        big, mid, maker, name, spec, unit, goods_no = row[:7]
        if not name or not goods_no:
            skipped_bad += 1
            continue
        code = str(goods_no).strip()
        if code in existing_codes or code in seen_codes:
            skipped_dupe += 1
            continue
        seen_codes.add(code)
        ts = now_str()
        to_insert.append((
            code,
            str(name).strip(),
            str(maker).strip() if maker else None,
            str(spec).strip() if spec else None,
            str(big).strip() if big else "기타",
            str(mid).strip() if mid else None,
            str(unit).strip() if unit else "개",
            random_price(),
            None,  # description
            None,  # image_key
            sort_order,
            1,     # is_active
            ts, ts,
        ))
        sort_order += 1

    cur.executemany(
        """INSERT INTO supply_catalog
           (code, name, manufacturer, spec, category, sub_category, unit, unit_price,
            description, image_key, sort_order, is_active, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        to_insert,
    )
    con.commit()
    total = cur.execute("SELECT COUNT(*) FROM supply_catalog").fetchone()[0]
    con.close()

    print(f"삽입: {len(to_insert)}건 / 건너뜀(중복 코드): {skipped_dupe}건 / 건너뜀(불량 행): {skipped_bad}건")
    print(f"supply_catalog 총 {total}건")


if __name__ == "__main__":
    main()
