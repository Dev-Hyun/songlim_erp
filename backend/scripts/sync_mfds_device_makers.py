"""식약처 의료기기 품목허가 원장을 mfds_device_items에 적재한다 — 심평원 장비의 제조사 대조표.

왜 필요한가:
  심평원 '의료장비 상세 현황'에는 제조사 컬럼이 없다. 있는 건 `장비허가번호`뿐인데, 이 번호가
  식약처 품목허가의 `MEDDEV_ITEM_NO`와 같은 체계다. 식약처 쪽 213K건을 통째로 받아 두면
  허가번호 -> 제조사(MNSC_NM) 매핑표가 만들어지고, equipment 466K행에 제조사를 붙일 수 있다.
  (허가번호로 필터링하는 파라미터가 먹지 않아서 — totalCount가 안 변한다 — 전체를 받아야 한다.)

API: https://apis.data.go.kr/1471000/MdeqPrdlstInfoService02/getMdeqPrdlstInfoInq02
  numOfRows 최대 500 (1000을 주면 빈 응답이 온다) -> 약 428페이지.

허가번호 정규화: 공백 제거 + 지방청 접두어(서울|부산|경인|대구|광주|대전) 제거.
  '서울 수신 05-378 호' -> '수신05-378호'. 심평원 CSV의 '수허13-302호'와 같은 모양이 된다.
  (import_hira_equipment_full.norm_license 와 같은 규칙 — 그 함수를 그대로 가져다 쓴다.)

중간 실패 대비: **페이지 단위로 커밋**한다. item_sn(MDEQ_PRDLST_SN)이 유니크라 재실행이 멱등하고
(UPSERT), --start-page 로 끊긴 지점부터 이어받을 수 있다.

사용법:
  python backend/scripts/sync_mfds_device_makers.py --pages 3      # 3페이지만 dry-run
  python backend/scripts/sync_mfds_device_makers.py --apply        # 전체 적재 (백업 자동)
  python backend/scripts/sync_mfds_device_makers.py --apply --start-page 210   # 재개
"""
import argparse
import os
import shutil
import sqlite3
import sys
import time
from datetime import datetime

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_hira_equipment_full import norm_license  # noqa: E402  (허가번호 정규화 규칙 공유)

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BASE, "data.db")
URL = "https://apis.data.go.kr/1471000/MdeqPrdlstInfoService02/getMdeqPrdlstInfoInq02"
PAGE_SIZE = 500  # 1000을 주면 빈 응답이 온다 (실측)
RETRIES = 3

UPSERT = """
INSERT INTO mfds_device_items
  (item_sn, license_no, maker_name, client_name, item_name, type_info,
   permit_date, revoked_code, revoked_date, nation, industry, created_at, updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(item_sn) DO UPDATE SET
  license_no = excluded.license_no, maker_name = excluded.maker_name,
  client_name = excluded.client_name, item_name = excluded.item_name,
  type_info = excluded.type_info, permit_date = excluded.permit_date,
  revoked_code = excluded.revoked_code, revoked_date = excluded.revoked_date,
  nation = excluded.nation, industry = excluded.industry, updated_at = excluded.updated_at
"""


def load_key() -> str:
    env = os.path.join(BASE, ".env")
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            if line.startswith("HIRA_API_KEY"):  # data.go.kr 일반 인증키 — 심평원·식약처 공용
                return line.split("=", 1)[1].strip()
    return os.environ.get("HIRA_API_KEY", "")


def txt(v) -> str | None:
    s = str(v).strip() if v is not None else ""
    return s or None


def fetch_page(key: str, page: int) -> tuple[list[dict], int]:
    last = None
    for attempt in range(RETRIES):
        try:
            r = requests.get(URL, params={"serviceKey": key, "numOfRows": str(PAGE_SIZE),
                                          "pageNo": str(page), "type": "json"}, timeout=60)
            r.raise_for_status()
            body = r.json().get("body") or {}
            items = body.get("items") or []
            return [i.get("item", i) for i in items], int(body.get("totalCount") or 0)
        except Exception as e:  # 공공 API는 간헐적으로 빈 응답/504를 준다
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"{page}페이지 {RETRIES}회 실패: {type(last).__name__}: {last}")


def to_row(it: dict, now: str) -> tuple | None:
    sn = txt(it.get("MDEQ_PRDLST_SN"))
    lic = norm_license(txt(it.get("MEDDEV_ITEM_NO")) or "")
    if not sn or not lic:
        return None
    return (
        sn, lic, txt(it.get("MNSC_NM")), txt(it.get("MNFT_CLNT_NM")), txt(it.get("PRDLST_NM")),
        txt(it.get("TYPE_INFO")), txt(it.get("PRMSN_YMD")), txt(it.get("RTRCN_DSCTN_DIVS_CD")),
        txt(it.get("RTRCN_DSCTN_DT")), txt(it.get("MNSC_NATN_CD")), txt(it.get("INDT_NM")), now, now,
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true", help="실제 반영 (기본은 dry-run)")
    ap.add_argument("--pages", type=int, default=0, help="가져올 페이지 수 제한 (0=전체)")
    ap.add_argument("--start-page", type=int, default=1, help="이어받기 시작 페이지")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    key = load_key()
    if not key:
        print("HIRA_API_KEY 를 찾을 수 없습니다 (backend/.env 확인)")
        return 1

    conn = sqlite3.connect(args.db, timeout=60)
    before = conn.execute("SELECT COUNT(*) FROM mfds_device_items").fetchone()[0]
    print(f"DB: {args.db}\nmfds_device_items 기존 행: {before:,}")

    if args.apply and args.start_page == 1:
        backup = f"{args.db}.bak_mfds_sync_{int(time.time())}"
        shutil.copy2(args.db, backup)
        print(f"백업 생성: {backup}")

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    page, total, seen, stored, skipped = args.start_page, None, 0, 0, 0
    t0 = time.time()
    while True:
        try:
            items, total = fetch_page(key, page)
        except RuntimeError as e:
            print(f"\n{e}")
            print(f"이어받으려면: --apply --start-page {page}")
            return 1
        if not items:
            break
        seen += len(items)
        rows = [to_row(it, now) for it in items]
        good = [r for r in rows if r]
        skipped += len(rows) - len(good)
        if args.apply:
            conn.executemany(UPSERT, good)
            conn.commit()  # 페이지 단위 커밋 — 중간에 끊겨도 여기까지는 남는다
        stored += len(good)

        pages_total = (total + PAGE_SIZE - 1) // PAGE_SIZE if total else page
        sys.stdout.write(f"\r  {page}/{pages_total} 페이지 · 수신 {seen:,} · 적재 {stored:,}")
        sys.stdout.flush()
        if args.pages and page - args.start_page + 1 >= args.pages:
            break
        if total and page * PAGE_SIZE >= total:
            break
        page += 1

    print(f"\n수신 {seen:,}건 (API totalCount {total:,}) · 적재 {stored:,} · "
          f"허가번호/일련번호 없어 제외 {skipped:,} · {time.time() - t0:.0f}초")

    if not args.apply:
        print("[dry-run] 실제 반영하려면 --apply 를 붙이세요.")
        return 0

    after = conn.execute("SELECT COUNT(*) FROM mfds_device_items").fetchone()[0]
    lic = conn.execute("SELECT COUNT(DISTINCT license_no) FROM mfds_device_items").fetchone()[0]
    mk = conn.execute("SELECT COUNT(DISTINCT maker_name) FROM mfds_device_items "
                      "WHERE maker_name IS NOT NULL").fetchone()[0]
    has_mk = conn.execute("SELECT COUNT(*) FROM mfds_device_items "
                          "WHERE maker_name IS NOT NULL").fetchone()[0]
    print(f"mfds_device_items {before:,} -> {after:,}행 (신규 {after - before:,})")
    print(f"고유 허가번호 {lic:,} · 제조사 있는 행 {has_mk:,} ({has_mk / after * 100:.1f}%) · "
          f"고유 제조사 {mk:,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
