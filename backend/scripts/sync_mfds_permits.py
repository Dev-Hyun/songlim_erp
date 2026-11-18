"""식약처 의료기기 품목허가(업체명·제조원)를 mfds_permits 에 적재한다 — 국내 제조 장비의 제조사 대조표.

왜 필요한가:
  기존 mfds_device_items(MdeqPrdlstInfoService02)에는 허가 업체명이 없고 제조원(MNSC_NM)도
  수입품에만 차 있다. 그래서 국내 제조 장비(제허·제인·제신…)는 허가번호가 맞아도 제조사가 비었다
  (예: 2024 저주파자극기 C108 대수 90%가 제조사 없음). 15057456 API의 ENTRPS(허가 업체)가
  국내 제조 허가에서는 곧 제조사다.

API: https://apis.data.go.kr/1471000/MdlpPrdlstPrmisnInfoService06/getMdlpPrdlstPrmisnList05
  (data.go.kr 15057456 — HIRA_API_KEY 와 같은 일반 인증키, 별도 활용신청 필요)
  numOfRows 500 · 약 21.5만 건 = 약 430페이지(호출 430회). 허가번호 필터가 없어 전체를 받는다.

허가번호 정규화: import_hira_equipment_full.norm_license (equipment.license_no 와 같은 규칙).

이 스크립트는 mfds_permits 표만 쓴다(UPSERT). equipment 는 건드리지 않는다 — 반영은 apply_brand.py.
그래서 전체 DB 백업은 뜨지 않는다. 되돌리기는 `DELETE FROM mfds_permits` 면 충분하다.

중간 실패 대비: 페이지 단위 커밋 + item_sn 유니크 UPSERT(멱등) + --start-page 로 이어받기.

사용법:
  python backend/scripts/sync_mfds_permits.py --pages 2        # 2페이지만 dry-run (DB 안 씀)
  python backend/scripts/sync_mfds_permits.py --apply          # 전체 적재
  python backend/scripts/sync_mfds_permits.py --apply --start-page 210   # 재개
"""
import argparse
import os
import sqlite3
import sys
import time
from datetime import datetime

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_hira_equipment_full import norm_license  # noqa: E402  (허가번호 정규화 규칙 공유)
from sync_mfds_device_makers import load_key, txt  # noqa: E402  (같은 인증키·같은 값 정리)

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BASE, "data.db")
URL = "https://apis.data.go.kr/1471000/MdlpPrdlstPrmisnInfoService06/getMdlpPrdlstPrmisnList05"
PAGE_SIZE = 500
RETRIES = 5

UPSERT = """
INSERT INTO mfds_permits
  (item_sn, license_no, entrps, manuf_nm, client_name, product, permit_date,
   revoked_code, changed_date, created_at, updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(item_sn) DO UPDATE SET
  license_no = excluded.license_no, entrps = excluded.entrps, manuf_nm = excluded.manuf_nm,
  client_name = excluded.client_name, product = excluded.product,
  permit_date = excluded.permit_date, revoked_code = excluded.revoked_code,
  changed_date = excluded.changed_date, updated_at = excluded.updated_at
"""


def fetch_page(key: str, page: int) -> tuple[list[dict], int]:
    last = None
    for attempt in range(RETRIES):
        try:
            r = requests.get(URL, params={"serviceKey": key, "numOfRows": str(PAGE_SIZE),
                                          "pageNo": str(page), "type": "json"}, timeout=90)
            r.raise_for_status()
            # 활용신청 전 키·트래픽 초과 등은 200 + XML 오류 본문으로 온다
            if not r.text.lstrip().startswith("{"):
                raise ValueError("JSON 이 아닌 응답(인증키 미승인·트래픽 초과일 수 있음)")
            body = r.json().get("body") or {}
            items = body.get("items") or []
            return [i.get("item", i) for i in items], int(body.get("totalCount") or 0)
        except Exception as e:  # 공공 API는 간헐적으로 빈 응답/504를 준다. 키가 섞일 수 있어 메시지만 남긴다
            last = type(e).__name__
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"{page}페이지 {RETRIES}회 실패: {last}")


def to_row(it: dict, now: str) -> tuple | None:
    sn = txt(it.get("MDEQ_PRDLST_SN"))
    if not sn:
        return None
    return (
        sn, norm_license(txt(it.get("PRDUCT_PRMISN_NO")) or ""), txt(it.get("ENTRPS")),
        txt(it.get("MANUF_NM")), txt(it.get("MNFT_CLNT_NM")), txt(it.get("PRDUCT")),
        txt(it.get("PRMISN_DT")), txt(it.get("RTRCN_DSCTN_DIVS_CD")), txt(it.get("CHG_DT")), now, now,
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
    before = conn.execute("SELECT COUNT(*) FROM mfds_permits").fetchone()[0]
    print(f"DB: {args.db}\nmfds_permits 기존 행: {before:,}")

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    page, total, seen, stored = args.start_page, 0, 0, 0
    t0 = time.time()
    while True:
        try:
            items, total = fetch_page(key, page)
        except RuntimeError as e:
            print(f"\n{e}\n이어받으려면: --apply --start-page {page}")
            return 1
        if not items:
            break
        seen += len(items)
        good = [r for r in (to_row(it, now) for it in items) if r]
        if args.apply:
            conn.executemany(UPSERT, good)
            conn.commit()  # 페이지 단위 커밋 — 중간에 끊겨도 여기까지는 남는다
        stored += len(good)
        pages_total = (total + PAGE_SIZE - 1) // PAGE_SIZE if total else page
        print(f"  {page}/{pages_total} 페이지 · 수신 {seen:,} · 적재 {stored:,} · "
              f"{time.time() - t0:.0f}초", flush=True)
        if args.pages and page - args.start_page + 1 >= args.pages:
            break
        if total and page * PAGE_SIZE >= total:
            break
        page += 1

    print(f"수신 {seen:,}건 (API totalCount {total:,}) · 적재 {stored:,} · {time.time() - t0:.0f}초")
    if not args.apply:
        print("[dry-run] 실제 반영하려면 --apply 를 붙이세요.")
        return 0

    n, lic, ent = conn.execute(
        "SELECT COUNT(*), COUNT(DISTINCT license_no), SUM(entrps IS NOT NULL) FROM mfds_permits"
    ).fetchone()
    print(f"mfds_permits {before:,} -> {n:,}행 · 고유 허가번호 {lic:,} · 업체명 있는 행 {ent:,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
