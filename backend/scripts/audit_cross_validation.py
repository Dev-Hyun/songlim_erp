"""공공 API 교차검증 — hospitals/equipment를 심평원·식약처 원본과 대조한다 (읽기 전용).

무엇을 대조하나
  1장 병원  : 심평원 병원정보서비스(ykiho 조인) vs hospitals
              이름 / 종별 / 주소 / 개설일 / 시도 / 시군구 / 좌표거리(0.1·1·10·100km)
              ※ 광주를 전라남도로 통합한 것은 **의도된 차이**라 오류로 세지 않는다
                 (심평원도 sidoCdNm을 '전남광주'로 준다).
  2장 장비  : (hospital_id, category, model, year) 중복, 완전동일행 중복, eq_count 이상치
  3장 제조사: source='import' 레거시 510,168행의 manufacturer를 식약처 형명(TYPE_INFO)과 대조
  4장 샘플  : 실제 병원 5곳을 원본과 한 건씩 대조

이 스크립트는 **아무것도 수정하지 않는다.** 수정은 fill_hospital_coords.py 등 별도 스크립트로 한다.

사용법
  python backend/scripts/audit_cross_validation.py
  python backend/scripts/audit_cross_validation.py --chapter 3
  python backend/scripts/audit_cross_validation.py --refresh   # 심평원 캐시 새로 받기
"""
import argparse
import collections
import json
import math
import os
import re
import sqlite3
import sys
import xml.etree.ElementTree as ET

import requests

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(BASE, "data.db")
CACHE = os.path.join(BASE, "scripts", "_audit_cache", "hira_hosp_fresh.jsonl")
HIRA_URL = "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList"

NAME_STRIP = re.compile(r"[\s()\[\]\"']")
ADDR_STRIP = re.compile(r"[\s,()\-]")
CORP = re.compile(
    r"(주식회사|유한회사|㈜|\(주\)|\(유\)|co\.?,?\s*ltd\.?|company|corporation|corp\.?|"
    r"limited|ltd\.?|inc\.?|gmbh|llc|co\.?,)", re.IGNORECASE)
NON_WORD = re.compile(r"[^0-9a-z가-힣]")
TYPE_TAIL = re.compile(r"외\s*\d+\s*건\s*$")
HAS_ALPHA = re.compile(r"[a-z가-힣]")

CL_MAP = {"상급종합": "상급종합병원"}
SIDO_MAP = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시", "인천": "인천광역시",
    "대전": "대전광역시", "울산": "울산광역시", "세종시": "세종특별자치시", "경기": "경기도",
    "강원": "강원특별자치도", "충북": "충청북도", "충남": "충청남도", "전북": "전북특별자치도",
    "경북": "경상북도", "경남": "경상남도", "제주": "제주특별자치도",
    # 광주는 전라남도로 통합돼 있다 — 심평원 표기 '전남광주'도 여기로 접는다(의도된 차이)
    "전남광주": "전라남도", "전남": "전라남도", "광주": "전라남도",
}
# import 레거시가 쓰는 대분류 -> 식약처 품목명에 들어있는 키워드. 모델명 충돌(예: OsteoSys
# PRIMUS(골밀도) vs Dräger Primus(마취기))을 걸러내기 위해 반드시 품목 계열을 맞춘다.
CAT_KEYWORD = {"us": "초음파", "xray": "엑스선", "bmd": "골밀도",
               "carm": "엑스선", "ct": "전산화단층", "mri": "자기공명"}
# 같은 기업집단(브랜드명 <-> 법인명/해외 제조소명)을 하나로 접는다.
# 접지 않으면 'GE Healthcare vs GE Medical Systems (China)' 같은 게 전부 오류로 잡힌다.
MAKER_GROUPS = [
    ("GE", ["gemedical", "gevingmed", "gehualun", "gehealthcare", "geyokogawa", "geoec",
            "gehangwei", "한국지이"]),
    ("SIEMENS", ["siemens", "acuson"]),
    ("PHILIPS", ["philips", "philps", "marconimedical", "atlultrasound"]),
    ("FUJIFILM/HITACHI", ["fujifilm", "hitachi", "aloka"]),
    ("CANON/TOSHIBA", ["canon", "toshiba"]),
    ("SAMSUNG", ["samsung", "medison", "삼성메디슨", "삼성전자"]),
    ("DK메디칼", ["dk메디칼", "디케이메디칼"]),
    ("HOLOGIC", ["hologic", "lorad"]),
    ("MINDRAY", ["mindray"]),
    ("OSTEOSYS", ["osteosys", "오스테오시스"]),
    ("LISTEM", ["listem", "리스템"]),
    ("DRGEM", ["drgem", "디알젬"]),
    ("DRTECH", ["drtech", "디알텍"]),
    ("GENORAY", ["genoray", "제노레이"]),
    ("ECORAY", ["ecoray", "에코레이"]),
    ("GEMSS", ["gemss", "젬스"]),
    ("ALPINION", ["alpinion", "알피니언"]),
    ("VATECH", ["vatech", "바텍"]),
    ("비엠텍", ["비엠텍", "bmtech", "요즈마비엠텍"]),
    ("SG헬스케어", ["sghealthcare", "에스지헬스케어"]),
]


def nname(s):
    return NAME_STRIP.sub("", (s or "").lower())


def naddr(s):
    return ADDR_STRIP.sub("", (s or "")).lower()


def maker_key(s):
    return NON_WORD.sub("", CORP.sub("", (s or "").lower()))


def model_key(s):
    return NON_WORD.sub("", (s or "").lower())


def maker_group(s):
    k = maker_key(s)
    for g, toks in MAKER_GROUPS:
        if any(t in k for t in toks):
            return g
    return None


def to_iso(e):
    e = (e or "").strip()
    return "{}-{}-{}".format(e[:4], e[4:6], e[6:]) if len(e) == 8 and e.isdigit() else None


def km(la1, lo1, la2, lo2):
    p = math.pi / 180
    return 2 * 6371 * math.asin(math.sqrt(
        math.sin((la2 - la1) * p / 2) ** 2
        + math.cos(la1 * p) * math.cos(la2 * p) * math.sin((lo2 - lo1) * p / 2) ** 2))


def collapse_sgg(s):
    """'포항시 북구' -> '포항북구'. normalize_hospital_region.py와 같은 접기 규칙."""
    return re.sub(r"시\s+(?=\S+구$)", "", s).replace(" ", "")


def load_hira(refresh):
    if refresh or not os.path.exists(CACHE):
        key = ""
        env = os.path.join(BASE, ".env")
        if os.path.exists(env):
            for line in open(env, encoding="utf-8"):
                if line.startswith("HIRA_API_KEY"):
                    key = line.split("=", 1)[1].strip()
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        page, n = 1, 0
        with open(CACHE, "w", encoding="utf-8") as f:
            while True:
                r = requests.get(HIRA_URL, params={"serviceKey": key, "numOfRows": "1000",
                                                   "pageNo": str(page)}, timeout=60)
                r.raise_for_status()
                root = ET.fromstring(r.text)
                items = root.findall(".//item")
                if not items:
                    break
                for it in items:
                    d = {k: (it.findtext(k) or "").strip()
                         for k in ("ykiho", "yadmNm", "clCdNm", "sidoCdNm", "sgguCdNm",
                                   "addr", "estbDd", "telno", "XPos", "YPos")}
                    if d["ykiho"]:
                        f.write(json.dumps(d, ensure_ascii=False) + "\n")
                        n += 1
                total = int(root.findtext(".//totalCount") or 0)
                sys.stdout.write("\r  심평원 수신 {:,}건".format(n))
                sys.stdout.flush()
                if total and page * 1000 >= total:
                    break
                page += 1
        print()
    return {d["ykiho"]: d for d in (json.loads(x) for x in open(CACHE, encoding="utf-8"))}


# =========================================================================== 1장
def chapter_hospitals(conn, api):
    print("=" * 78)
    print("1장. 병원 — 심평원 병원정보서비스 대조 (ykiho 조인)")
    print("=" * 78)
    db = {r[0]: r for r in conn.execute(
        "SELECT ykiho, id, name, name_norm, type, sido, sigungu, address, lat, lng, estb_date "
        "FROM hospitals WHERE ykiho IS NOT NULL")}
    joined = [k for k in db if k in api]
    print("심평원 {:,}건 · DB ykiho 보유 {:,}행 · 조인 {:,}행".format(len(api), len(db), len(joined)))
    print("  심평원에만 있음 {:,} · DB에만 있음 {:,}".format(
        len(set(api) - set(db)), len(set(db) - set(api))))
    only_db = collections.Counter(db[k][4] for k in set(db) - set(api))
    print("  DB에만 있는 행 종별: " + ", ".join("{} {:,}".format(k, v) for k, v in only_db.most_common(6)))

    # 시군구는 표기 차이를 먼저 접는다 (심평원 '포항북구' vs 우리 '포항시 북구'는 오류가 아니다)
    per = collections.defaultdict(collections.Counter)
    for sido, sgg, n in conn.execute(
        "SELECT sido, sigungu, COUNT(*) FROM hospitals "
        "WHERE sido IS NOT NULL AND sigungu IS NOT NULL GROUP BY 1, 2"
    ):
        per[(sido, collapse_sgg(sgg))][sgg] += n
    sggmap = {k: c.most_common(1)[0][0] for k, c in per.items()}

    cnt = collections.Counter()
    ex = collections.defaultdict(list)
    dists = []
    for k in joined:
        a = api[k]
        _, hid, name, nn, typ, sido, sgg, addr, lat, lng, estb = db[k]
        if nname(a["yadmNm"]) != (nn or nname(name)):
            cnt["이름 불일치"] += 1
            ex["이름"].append((hid, name, a["yadmNm"]))
        at = CL_MAP.get(a["clCdNm"], a["clCdNm"])
        if at and at != typ:
            cnt["종별 불일치"] += 1
            ex["종별"].append((hid, name, typ, at))
        if a["addr"] and addr and naddr(a["addr"]) != naddr(addr):
            cnt["주소 불일치"] += 1
            ex["주소"].append((hid, name, addr, a["addr"]))
        if a["addr"] and not addr:
            cnt["주소 우리쪽 없음"] += 1
        ae = to_iso(a["estbDd"])
        if ae and estb and ae != estb:
            cnt["개설일 불일치"] += 1
            ex["개설일"].append((hid, name, estb, ae))
        if ae and not estb:
            cnt["개설일 우리쪽 없음"] += 1
        asido = SIDO_MAP.get(a["sidoCdNm"])
        asgg = sggmap.get((asido, collapse_sgg(a["sgguCdNm"])), a["sgguCdNm"])
        if asido and asido != sido:
            cnt["시도 불일치 (광주->전남 통합분 제외)"] += 1
            ex["시도"].append((hid, name, sido, sgg, asido, asgg, addr))
        elif asgg and sgg and asgg != sgg:
            cnt["시군구 불일치 (표기접기 후)"] += 1
            ex["시군구"].append((hid, name, sido, sgg, asgg, addr))
        try:
            alat, alng = float(a["YPos"]), float(a["XPos"])
        except (TypeError, ValueError):
            alat = None
        if alat is not None and lat is not None:
            dists.append((km(lat, lng, alat, alng), hid, name, lat, lng, alat, alng))
        elif alat is None and lat is not None:
            cnt["심평원에 좌표 없음(우리는 있음)"] += 1
        elif alat is not None and lat is None:
            cnt["우리쪽 좌표 없음(심평원엔 있음)"] += 1

    print("\n[불일치 집계]")
    for k, v in cnt.most_common():
        print("  {:38s} {:,}".format(k, v))
    print("\n[좌표 차이] 양쪽 모두 좌표 있는 {:,}행 기준".format(len(dists)))
    for th in (0.1, 1, 10, 100):
        print("  {:>6}km 초과: {:,}".format(th, sum(1 for d in dists if d[0] > th)))
    dists.sort(reverse=True)
    print("  차이 큰 순 15건 (수정하지 않고 보고만 한다):")
    for d in dists[:15]:
        print("    {:8.1f}km  id={:<6} {:24s} 우리({:.4f},{:.4f}) 심평원({:.4f},{:.4f})".format(
            d[0], d[1], d[2][:24], d[3], d[4], d[5], d[6]))
    for key in ("이름", "종별", "시도", "시군구", "주소", "개설일"):
        if not ex[key]:
            continue
        print("\n  [{} 불일치 샘플 6]".format(key))
        for s in ex[key][:6]:
            print("    " + " | ".join(str(x) for x in s))
    return cnt, dists, ex


# =========================================================================== 2장
def chapter_equipment(conn):
    print("\n" + "=" * 78)
    print("2장. 장비 — 중복 / eq_count 이상치")
    print("=" * 78)
    q = lambda s: conn.execute(s).fetchall()
    print("총 {:,}행 · 고아(병원 없음) {:,}행".format(
        q("SELECT COUNT(*) FROM equipment")[0][0],
        q("SELECT COUNT(*) FROM equipment e LEFT JOIN hospitals h ON h.id=e.hospital_id "
          "WHERE h.id IS NULL")[0][0]))
    r = q("""SELECT COUNT(*), SUM(n-1) FROM (SELECT COUNT(*) n FROM equipment WHERE model IS NOT NULL
             GROUP BY hospital_id, category, model, year HAVING COUNT(*)>1)""")[0]
    print("\n[(hospital_id, category, model, year) 중복]  그룹 {:,} · 초과행 {:,}".format(r[0] or 0, r[1] or 0))
    print("  source별 초과행:")
    for row in q("""SELECT source, COUNT(*), SUM(n-1) FROM (SELECT source, COUNT(*) n FROM equipment
             WHERE model IS NOT NULL GROUP BY hospital_id, category, model, year, source
             HAVING COUNT(*)>1) GROUP BY 1 ORDER BY 3 DESC"""):
        print("    {:14s} 그룹 {:,} · 초과행 {:,}".format(row[0], row[1], row[2]))
    print("\n[모든 의미 컬럼이 같은 완전동일행 중복] — 이쪽이 '진짜 중복'이다")
    for src in ("import", "hira_2025", "odcloud_2023", "odcloud_2024"):
        r = conn.execute(
            "SELECT COUNT(*), SUM(n-1) FROM (SELECT COUNT(*) n FROM equipment WHERE source=? "
            "GROUP BY hospital_id, category, category_name, subcategory_name, model, year, "
            "manufacturer, eq_count, license_no HAVING COUNT(*)>1)", (src,)).fetchone()
        print("  {:14s} 그룹 {:,} · 초과행 {:,}".format(src, r[0] or 0, r[1] or 0))
    print("\n  주: hira_2025의 '중복'은 대부분 **허가번호가 다른 별개 장비**다(같은 모델을 다른 "
          "허가번호로 신고). 완전동일행만이 실제 중복이다.")

    print("\n[eq_count 이상치]")
    print("  0 이하: {:,}".format(q("SELECT COUNT(*) FROM equipment WHERE eq_count<=0")[0][0]))
    for th in (10, 20, 50, 100, 200):
        print("  {:>3} 초과: {:,}".format(th, q("SELECT COUNT(*) FROM equipment WHERE eq_count>%d" % th)[0][0]))
    print("  최대값 상위 8:")
    for row in q("""SELECT e.eq_count, h.name, h.type, e.category_name, e.model, e.year, e.source
                    FROM equipment e JOIN hospitals h ON h.id=e.hospital_id
                    ORDER BY e.eq_count DESC LIMIT 8"""):
        print("    {:4d}  {:22s} {:8s} {:16s} {} ({}, {})".format(
            row[0], (row[1] or "")[:22], (row[2] or "")[:8], (row[3] or "")[:16], row[4], row[5], row[6]))
    print("\n  year 범위 밖(2000 미만/2026 초과): {:,}".format(
        q("SELECT COUNT(*) FROM equipment WHERE year<2000 OR year>2026")[0][0]))


# =========================================================================== 3장
def chapter_manufacturer(conn, top=30):
    print("\n" + "=" * 78)
    print("3장. 제조사 — source='import' 레거시 vs 식약처 형명(TYPE_INFO)")
    print("=" * 78)
    idx = collections.defaultdict(collections.Counter)
    kws = set(CAT_KEYWORD.values())
    for maker, item, ti in conn.execute(
        "SELECT maker_name, item_name, type_info FROM mfds_device_items "
        "WHERE maker_name IS NOT NULL AND type_info IS NOT NULL"
    ):
        hit = [k for k in kws if k in (item or "")]
        if not hit:
            continue
        for part in re.split(r"[,;/]|\s{2,}", ti):
            t = model_key(TYPE_TAIL.sub("", part).strip())
            if len(t) < 4 or not HAS_ALPHA.search(t):
                continue
            for k in hit:
                idx[(k, t)][maker] += 1
    print("식약처 (품목계열, 형명) 인덱스 {:,}개".format(len(idx)))

    total = covered = same = 0
    raw, real = [], []
    for cat, model, mfr, n in conn.execute(
        "SELECT category, model, manufacturer, COUNT(*) FROM equipment "
        "WHERE source='import' AND model IS NOT NULL AND manufacturer IS NOT NULL GROUP BY 1,2,3"
    ):
        total += n
        kw = CAT_KEYWORD.get(cat)
        c = idx.get((kw, model_key(model))) if kw else None
        if not c or len(c) != 1:      # 형명이 제조사 한 곳으로만 떨어질 때만 근거로 쓴다
            continue
        auth = next(iter(c))
        covered += n
        ka, kb = maker_key(mfr), maker_key(auth)
        if ka == kb or (ka and kb and (ka in kb or kb in ka)):
            same += n
            continue
        raw.append((n, cat, model, mfr, auth))
        ga, gb = maker_group(mfr), maker_group(auth)
        if ga and gb and ga == gb:
            same += n
            continue
        real.append((n, cat, model, mfr, auth))
    print("import {:,}행 중 식약처 형명으로 제조사가 단일 확정되는 행 {:,} ({:.1%})".format(
        total, covered, covered / total))
    print("  문자열 그대로 불일치    {:,}조합 / {:,}행".format(len(raw), sum(r[0] for r in raw)))
    print("  기업집단 접은 뒤 불일치 {:,}조합 / {:,}행 ({:.1%} of 대조가능)".format(
        len(real), sum(r[0] for r in real), sum(r[0] for r in real) / covered))
    real.sort(reverse=True)
    print("\n[기업집단을 접고도 남는 불일치 상위 {}]  (행수 | 분류 | 모델 | 우리 값 | 식약처 값)".format(top))
    for r in real[:top]:
        print("  {:6,} | {:5s} | {:34s} | {:22s} | {}".format(
            r[0], r[1], r[2][:34], r[3][:22], r[4][:44]))
    print("\n  참고: manufacturer='기타'/'미상' 행 {:,}".format(
        conn.execute("SELECT COUNT(*) FROM equipment WHERE source='import' "
                     "AND manufacturer IN ('기타','미상')").fetchone()[0]))

    # --- 3-2. 허가번호 자체의 신뢰도 (제조사 오류의 진짜 원인) ---
    print("\n[3-2] 심평원 원본 허가번호의 신뢰도")
    r = conn.execute(
        "WITH m AS (SELECT license_no, MIN(maker_name) mk FROM mfds_device_items "
        "           WHERE maker_name IS NOT NULL GROUP BY 1 HAVING COUNT(DISTINCT maker_name)=1) "
        "SELECT COUNT(*) FROM equipment e JOIN m ON m.license_no=e.license_no "
        "WHERE e.manufacturer_confidence='확인' AND e.manufacturer IS NOT NULL "
        "AND e.manufacturer <> m.mk").fetchone()[0]
    print("  '확인' 등급이 식약처 제조사와 문자열까지 다른 행: {:,}  "
          "(= 우리 파이프라인은 식약처 값을 정확히 복사했다)".format(r))
    r = conn.execute(
        "WITH single AS (SELECT license_no FROM mfds_device_items GROUP BY 1 "
        "                HAVING COUNT(DISTINCT item_name)=1), "
        "     ours AS (SELECT license_no, COUNT(DISTINCT category_name) k, COUNT(*) n "
        "              FROM equipment WHERE license_no IS NOT NULL GROUP BY 1) "
        "SELECT SUM(CASE WHEN k>=2 THEN 1 ELSE 0 END), SUM(CASE WHEN k>=2 THEN n ELSE 0 END), "
        "       COUNT(*), SUM(n) FROM ours JOIN single USING(license_no)").fetchone()
    print("  식약처가 '품목 1종'으로 확정한 허가번호를 우리가 2종 이상 장비분류에 쓴 경우:")
    print("    허가번호 {:,}/{:,} · 장비행 {:,}/{:,} ({:.1%})".format(
        r[0], r[2], r[1], r[3], r[1] / r[3]))
    print("    -> 심평원 원본 CSV의 '장비허가번호' 칸이 그만큼 틀렸다는 뜻이다.")
    r = conn.execute(
        "SELECT COUNT(*), COUNT(DISTINCT license_no) FROM equipment "
        "WHERE license_no IS NOT NULL AND license_no NOT GLOB '[제수]*'").fetchone()
    print("  허가번호 형식이 아닌 값('0','미확인','임시…'): 행 {:,} · 값 {:,}종".format(r[0], r[1]))
    return real


# =========================================================================== 4장
def chapter_samples(conn, api, ids=None):
    print("\n" + "=" * 78)
    print("4장. 샘플 5건 — 원본과 한 건씩 대조")
    print("=" * 78)
    # 심평원 표기를 우리 표기로 옮긴 뒤 비교한다 ('경기' vs '경기도'는 불일치가 아니다)
    per = collections.defaultdict(collections.Counter)
    for sido, sgg, n in conn.execute(
        "SELECT sido, sigungu, COUNT(*) FROM hospitals "
        "WHERE sido IS NOT NULL AND sigungu IS NOT NULL GROUP BY 1, 2"
    ):
        per[(sido, collapse_sgg(sgg))][sgg] += n
    sggmap = {k: c.most_common(1)[0][0] for k, c in per.items()}
    if not ids:
        ids = [r[0] for r in conn.execute("""
            SELECT h.id FROM hospitals h WHERE h.ykiho IS NOT NULL AND h.lat IS NOT NULL
              AND h.type IN ('상급종합병원','종합병원','병원','의원','치과의원')
              AND EXISTS (SELECT 1 FROM equipment e WHERE e.hospital_id=h.id AND e.license_no IS NOT NULL)
            GROUP BY h.type HAVING COUNT(*)>0 ORDER BY h.id LIMIT 5""")]
    for hid in ids:
        h = conn.execute("SELECT id,name,type,sido,sigungu,address,lat,lng,ykiho,estb_date "
                         "FROM hospitals WHERE id=?", (hid,)).fetchone()
        a = api.get(h[8], {})
        print("\n--- id={} {} ({}) ---".format(h[0], h[1], h[2]))
        asido = SIDO_MAP.get(a.get("sidoCdNm", ""), a.get("sidoCdNm", "-"))
        asgg = sggmap.get((asido, collapse_sgg(a.get("sgguCdNm", ""))), a.get("sgguCdNm", "-"))
        rows = [("이름", h[1], a.get("yadmNm", "-")),
                ("종별", h[2], CL_MAP.get(a.get("clCdNm", ""), a.get("clCdNm", "-"))),
                ("시도/시군구", "{}/{}".format(h[3], h[4]), "{}/{}".format(asido, asgg)),
                ("주소", h[5] or "-", a.get("addr", "-")),
                ("개설일", h[9] or "-", to_iso(a.get("estbDd", "")) or "-")]
        for label, ours, theirs in rows:
            mark = "O" if naddr(str(ours)) == naddr(str(theirs)) else "X"
            print("   {:11s} 우리 : {}".format(label, ours))
            print("   {:11s} 원본 : {}  [{}]".format("", theirs, mark))
        try:
            d = km(h[6], h[7], float(a["YPos"]), float(a["XPos"]))
            print("   {:11s} 우리 : {:.6f},{:.6f}".format("좌표", h[6], h[7]))
            print("   {:11s} 원본 : {},{}  (차이 {:.0f}m) [{}]".format(
                "", a["YPos"], a["XPos"], d * 1000, "O" if d < 0.1 else "X"))
        except (KeyError, TypeError, ValueError):
            print("   {:11s} 우리 : {},{}  / 원본 : 심평원 좌표 없음".format("좌표", h[6], h[7]))
        print("   보유장비 (최신연도 상위 5, 제조사는 식약처 허가번호 역조회로 검증):")
        for cat, model, mfr, lic, conf, n, yr in conn.execute(
            "SELECT category_name, model, manufacturer, license_no, manufacturer_confidence, "
            "eq_count, year FROM equipment WHERE hospital_id=? ORDER BY year DESC, eq_count DESC LIMIT 5",
            (hid,)
        ):
            mf = conn.execute("SELECT DISTINCT maker_name FROM mfds_device_items "
                              "WHERE license_no=? AND maker_name IS NOT NULL", (lic,)).fetchall() if lic else []
            mfs = ", ".join(m[0] for m in mf) or "-"
            ok = "O" if mf and maker_key(mfr or "") == maker_key(mf[0][0]) else ("?" if not mf else "X")
            print("     {:16s} {:26s} x{} ({}) 우리제조사={} [{}]".format(
                (cat or "")[:16], (model or "")[:26], n, yr, mfr, conf or "-"))
            print("     {:16s} 허가번호={} -> 식약처 제조사={}  [{}]".format("", lic or "-", mfs[:48], ok))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--chapter", type=int, default=0, help="1~4 중 하나만 실행 (0=전체)")
    ap.add_argument("--refresh", action="store_true", help="심평원 캐시를 새로 받는다")
    ap.add_argument("--sample-ids", default="", help="4장에서 쓸 hospital id 쉼표 목록")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    conn = sqlite3.connect(args.db)
    api = load_hira(args.refresh)
    ch = args.chapter
    if ch in (0, 1):
        chapter_hospitals(conn, api)
    if ch in (0, 2):
        chapter_equipment(conn)
    if ch in (0, 3):
        chapter_manufacturer(conn)
    if ch in (0, 4):
        ids = [int(x) for x in args.sample_ids.split(",") if x.strip()]
        chapter_samples(conn, api, ids)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
