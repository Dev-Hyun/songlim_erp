"""심평원 병원정보서비스에서 개설일자·주소·좌표를 받아 hospitals 테이블을 채운다.

왜 필요한가:
  - 개설일자(estbDd)가 DB에 없어서 '의료기관 개설 현황' 화면이 연 단위 프록시로만 돌고 있었다.
  - 주소가 59,256행(91.6%), 좌표가 4,031행 비어 있었다. 이 API가 addr/XPos/YPos도 같이 준다.

매칭은 ykiho(요양기호) 기준. 우리 DB에 없는 기관은 무시한다(신규 삽입 안 함 — 지도 데이터의
출처를 장비 임포트로 유지하기 위해).

안전장치: dry-run 기본, --apply 시 백업 자동 생성. 주소/좌표는 **비어 있는 행만** 채운다
(--overwrite-coords 를 주면 기존 좌표도 덮어씀 — 좌표 오류 정정용).

사용법:
  python backend/scripts/sync_hira_hospital_info.py --pages 3          # 3페이지만 dry-run
  python backend/scripts/sync_hira_hospital_info.py --apply            # 전체 반영
  python backend/scripts/sync_hira_hospital_info.py --apply --overwrite-coords
"""
import argparse
import os
import sqlite3
import shutil
import sys
import time
import xml.etree.ElementTree as ET

import requests

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BASE, "data.db")
URL = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList"
PAGE_SIZE = 1000


def load_key() -> str:
    env = os.path.join(BASE, ".env")
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            if line.startswith("HIRA_API_KEY"):
                return line.split("=", 1)[1].strip()
    return os.environ.get("HIRA_API_KEY", "")


def to_iso(estb: str) -> str | None:
    """'19670523' -> '1967-05-23'. 형식이 어긋나면 버린다."""
    estb = (estb or "").strip()
    if len(estb) != 8 or not estb.isdigit():
        return None
    y, m, d = estb[:4], estb[4:6], estb[6:]
    if not ("1900" <= y <= "2100" and "01" <= m <= "12" and "01" <= d <= "31"):
        return None
    return f"{y}-{m}-{d}"


def fetch_page(key: str, page: int) -> tuple[list[dict], int]:
    r = requests.get(URL, params={"serviceKey": key, "numOfRows": str(PAGE_SIZE),
                                  "pageNo": str(page)}, timeout=30)
    r.raise_for_status()
    root = ET.fromstring(r.text)
    code = root.findtext(".//resultCode")
    if code and code != "00":
        raise RuntimeError(f"심평원 API 오류 {code}: {root.findtext('.//resultMsg')}")
    total = int(root.findtext(".//totalCount") or 0)
    out = []
    for it in root.findall(".//item"):
        ykiho = (it.findtext("ykiho") or "").strip()
        if not ykiho:
            continue
        out.append({
            "ykiho": ykiho,
            "estb": to_iso(it.findtext("estbDd") or ""),
            "addr": (it.findtext("addr") or "").strip() or None,
            "lng": it.findtext("XPos"),
            "lat": it.findtext("YPos"),
        })
    return out, total


def as_float(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--apply", action="store_true", help="실제 반영 (기본은 dry-run)")
    ap.add_argument("--pages", type=int, default=0, help="가져올 페이지 수 제한 (0=전체)")
    ap.add_argument("--overwrite-coords", action="store_true",
                    help="기존 좌표도 API 값으로 덮어쓴다 (좌표 오류 정정용)")
    args = ap.parse_args()

    key = load_key()
    if not key:
        print("HIRA_API_KEY 를 찾을 수 없습니다 (backend/.env 확인)")
        return 1

    conn = sqlite3.connect(args.db)
    known = {r[0]: (r[1], r[2], r[3], r[4]) for r in conn.execute(
        "SELECT ykiho, estb_date, address, lat, lng FROM hospitals WHERE ykiho IS NOT NULL")}
    print(f"DB: {args.db}\nykiho 보유 행: {len(known):,}")

    if args.apply:
        backup = f"{args.db}.bak_hira_sync_{int(time.time())}"
        shutil.copy2(args.db, backup)
        print(f"백업 생성: {backup}")

    page, total, seen = 1, None, 0
    n_estb = n_addr = n_coord = 0
    while True:
        try:
            items, total = fetch_page(key, page)
        except Exception as e:
            print(f"\n{page}페이지 실패: {type(e).__name__}: {e}")
            break
        if not items:
            break
        seen += len(items)

        for it in items:
            cur = known.get(it["ykiho"])
            if cur is None:
                continue  # 우리 DB에 없는 기관 — 건너뜀
            cur_estb, cur_addr, cur_lat, cur_lng = cur
            sets, vals = [], []
            if it["estb"] and it["estb"] != cur_estb:
                sets.append("estb_date = ?"); vals.append(it["estb"]); n_estb += 1
            if it["addr"] and not cur_addr:
                sets.append("address = ?"); vals.append(it["addr"]); n_addr += 1
            lat, lng = as_float(it["lat"]), as_float(it["lng"])
            if lat and lng and (args.overwrite_coords or cur_lat is None or cur_lng is None):
                sets.append("lat = ?"); vals.append(lat)
                sets.append("lng = ?"); vals.append(lng)
                n_coord += 1
            if sets and args.apply:
                vals.append(it["ykiho"])
                conn.execute(f"UPDATE hospitals SET {', '.join(sets)} WHERE ykiho = ?", vals)

        pages_total = (total + PAGE_SIZE - 1) // PAGE_SIZE if total else page
        sys.stdout.write(f"\r  {page}/{pages_total} 페이지 · 수신 {seen:,}건 · "
                         f"개설일 {n_estb:,} 주소 {n_addr:,} 좌표 {n_coord:,}")
        sys.stdout.flush()
        if args.pages and page >= args.pages:
            break
        if total and page * PAGE_SIZE >= total:
            break
        page += 1

    print()
    if args.apply:
        conn.commit()
        filled = conn.execute("SELECT COUNT(*) FROM hospitals WHERE estb_date IS NOT NULL").fetchone()[0]
        print(f"반영 완료. 개설일자 보유 행: {filled:,}")
    else:
        print("[dry-run] 실제 반영하려면 --apply 를 붙이세요.")
    print(f"갱신 예정/완료 — 개설일자 {n_estb:,} · 주소 {n_addr:,} · 좌표 {n_coord:,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
