import asyncio
import hashlib
import json
import os
import re
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import parse_qs, quote, urlencode, urlparse, urlunparse

import feedparser
import requests
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, get_db
from app.models import Bid, NewsArticle, User
from app.routers.admin import require_admin
from app.routers.auth import require_staff

router = APIRouter(prefix="/api", tags=["bids_news"])

G2B_API_KEY = os.environ.get("G2B_API_KEY", "")
G2B_LIST_URL = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoThng"
G2B_FILE_URL = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoThngFile"
D2B_LIST_URL = "https://www.d2b.go.kr/pdb/bid/getGoodsBidAnnounceListNew.json"
D2B_DETAIL_URL = "https://www.d2b.go.kr/pdb/bid/bidAnnounceView.do"
D2B_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.d2b.go.kr/pdb/bid/goodsBidAnnounceList.do?key=13",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
}
# 국방전자조달은 공고명 검색뿐이라 의료 낱말로 찾고 classify_bid 로 다시 거른다(의무=군 의무물자)
D2B_KEYWORDS = ["의무", "의료", "방사선", "엑스선", "X선", "초음파", "진단기", "내시경", "치과", "수술", "환자",
                "인공호흡", "제세동", "심장충격", "심전", "멸균", "소독기", "물리치료", "재활"]
D2B_MAX_PAGES = 10   # 낱말 하나에 최대 200건
# 나라장터: 최근 며칠 공고를 받을지. API는 한 번에 7일까지만 받는다(8일이면 HTTP 200 + 오류코드 07 '입력범위값 초과' — 2026-11-12 실측)
BID_DAYS = 14

_NEWS_SKIP_KW = ["부음", "부고", "조모상", "조부상", "부친상", "모친상", "별세", "타계", "숙환"]

# ────────────────────────────────────────────────────────
# 의료장비 입찰 분류 — 제목 규칙은 MEDIDOCS(pipeline/medidocs/collectors/bids.py)와 같다.
# 더해서 공고의 구매대상물품(purchsObjPrdctList, 물품분류번호 42=의료장비)을 본다:
# 제목이 "취약지 응급의료기관 장비지원사업"이어도 물품이 '디지털진단용엑스선촬영장치'면 X-ray로 잡힌다.
# ────────────────────────────────────────────────────────
# (분류, 포함 낱말) — 위에서부터 먼저 맞는 것으로. 소문자·공백 제거 후 비교. "~pet"은 앞뒤가 영문이 아닐 때만.
BID_CATEGORIES = [
    ("MRI", ["mri", "자기공명"]),
    ("PET·핵의학", ["~pet", "감마카메라", "~spect", "핵의학"]),
    ("CT", ["ct촬영", "ct장비", "전산화단층", "컴퓨터단층", "단층촬영", "~ct"]),
    ("혈관조영", ["혈관조영", "angio", "심혈관조영"]),
    ("유방촬영", ["유방촬영", "맘모", "mammo"]),
    ("C-arm·투시", ["c-arm", "carm", "씨암", "투시"]),
    ("골밀도", ["골밀도"]),
    ("X-ray", ["x선", "x-선", "x-ray", "xray", "엑스선", "엑스레이", "방사선촬영", "방사선발생", "디지털방사선", "일반촬영"]),
    ("초음파", ["초음파", "ultrasound", "sonograph"]),
    ("내시경", ["내시경", "기관지경", "복강경", "관절경", "방광경", "대장경", "endoscop"]),
    ("방사선치료", ["선형가속기", "방사선치료", "토모테라피", "근접치료"]),
    ("수술장비", ["수술대", "수술등", "무영등", "수술현미경", "전기수술", "로봇수술", "수술용", "네비게이션"]),
    ("생명유지·마취", ["인공호흡기", "마취기", "제세동기", "심장충격기", "심폐소생", "에크모", "체외순환", "인공신장", "투석",
                       "환자감시", "환자관찰", "환자모니터", "ventilator", "dialysis", "anesthesia", "defibrillator", "ecmo"]),
    ("검사장비", ["심전도", "심전계", "뇌파", "근전도", "폐기능", "혈액분석", "생화학분석", "면역분석", "검체", "진단검사", "현미경"]),
    ("치과장비", ["치과", "유니트체어", "구강"]),
    ("재활·물리치료", ["물리치료", "재활", "견인치료", "체외충격파", "저주파", "고주파치료"]),
    ("멸균·소독", ["멸균", "소독기", "세척소독"]),
    ("기타 의료장비", ["의료기기", "의료장비", "의료용", "의료기", "진료장비", "의무장비"]),
]
BID_CATEGORY_NAMES = [c for c, _ in BID_CATEGORIES]
BID_EXCLUDE = ["소모품", "필름", "시약", "약품", "현상액", "탐지기", "보안검색", "수하물", "세탁", "청소",
               "식자재", "급식", "드론", "사무용", "생리컵", "시금형", "시제품", "액화산소", "의료용가스",
               "의료가스", "의료용품", "회절", "방폭", "콘크리트",
               "동물용", "동물병원", "수의과대학", "가축", "실험동물", "사육", "해충", "지게차", "탈수기",
               "진료재료", "수술재료", "동물실험"]   # 물품으로 찾으면서 더함(재료 단가계약·동물실험용 X선)
# 제목이 장비를 콕 집어 말할 때는 살린다: "디지털 엑스선 촬영장치 구매 및 차폐시설 설치공사",
# "이동진료차량용 X-ray", "의대교육_범용초음파영상진단장치"는 장비 입찰이다(2026-11-12 운영 자료 점검).
BID_EXCLUDE_UNLESS_EQUIP = ["건축", "공사", "용역", "교육", "임대차", "차량"]
HOSPITAL_AGENCY = re.compile(r"병원|의료원|보건소|보건의료원|의료센터|의과대학|치과|재활원")
# 병원·보건 기관이 아닌 곳의 공고는 제목에 의료 낱말이 있을 때만(연구용 현미경·산업용 초음파·X선 회절 분석기 제외)
MED_AGENCY = re.compile(r"병원|의료|의학원|보건|적십자|건강관리|재활|요양|치과|의과대학|소방|119")
MED_TITLE = re.compile(r"의료|진료|환자|병원|보건|치료|진단|수술|검진|응급|재활|의료기기")

# 구매대상물품: 물품분류 42(의료장비·용품) 가운데 장비가 아닌 것은 뺀다(2026-11-06~12 공고 2,675건 점검)
ITEM_SKIP_FAMILIES = {"4212", "4213", "4221", "4230", "4231"}  # 동물용, 의료용 직물, 장애인 보조기구, 의학교육용, 상처치료 소모품
ITEM_SKIP_WORDS = ["시약", "카테터", "주사침", "주사기", "반창고", "거즈", "붕대", "드레싱", "재료", "골수술기", "기구홀더",
                   "수액세트", "혈액회로", "튜브", "커프"]
ITEM_FAMILY_FIRST = {"4228": "멸균·소독", "4215": "치과장비"}  # 초음파세척기·치과용 영상장치가 초음파·X-ray로 잡히지 않게
ITEM_WORDS_FIRST = [("초음파수술", "수술장비")]
ITEM_FAMILY_DEFAULT = {"4216": "생명유지·마취", "4217": "생명유지·마취", "4227": "생명유지·마취", "4218": "검사장비",
                       "4299": "검사장비", "4229": "수술장비", "4224": "재활·물리치료", "4225": "재활·물리치료"}


def _norm(s: str) -> str:
    # "재활용"이 재활로, "의료기관"이 의료기로 잡히지 않게
    return re.sub(r"\s+", "", (s or "").lower()).replace("재활용", "").replace("의료기관", "")


def _hit(t: str, w: str) -> bool:
    if w.startswith("~"):
        return re.search(rf"(?<![a-z]){re.escape(w[1:])}(?![a-z])", t) is not None
    return w in t


def _word_category(t: str) -> Optional[str]:
    for name, words in BID_CATEGORIES:
        if any(_hit(t, w) for w in words):
            return name
    return None


def _item_category(code: str, name: str) -> Optional[str]:
    """구매대상물품 하나 → 의료장비 분류. 의료장비가 아니면 None."""
    n = _norm(name)
    fam = code[:4]
    if not code.startswith("42") or fam in ITEM_SKIP_FAMILIES or any(w in n for w in ITEM_SKIP_WORDS):
        return None
    if fam in ITEM_FAMILY_FIRST:
        return ITEM_FAMILY_FIRST[fam]
    for w, cat in ITEM_WORDS_FIRST:
        if w in n:
            return cat
    cat = _word_category(n)
    if cat and cat != "기타 의료장비":   # '의료용분리방식임상화학자동분석장치'는 '의료용'보다 물품분류(검사장비)가 낫다
        return cat
    return ITEM_FAMILY_DEFAULT.get(fam, "기타 의료장비")


def _parse_products(raw) -> list:
    """purchsObjPrdctList '[1^4220189901^디지털진단용엑스선촬영장치],[2^...^...]' → [{code, name}] (중복 제거)"""
    out, seen = [], set()
    for code, name in re.findall(r"\[\d+\^(\d+)\^([^\]]*)\]", str(raw or "")):
        if (code, name) not in seen:
            seen.add((code, name))
            out.append({"code": code, "name": name.strip()})
    return out


def classify_bid(title: str, agency: str = "", products: list = ()) -> list:
    """의료장비 분류 목록(BID_CATEGORIES 순서). 의료장비 공고가 아니면 []."""
    t = _norm(title)
    if any(x in t for x in BID_EXCLUDE):
        return []
    if any(x in t for x in BID_EXCLUDE_UNLESS_EQUIP) and _word_category(t) in (None, "기타 의료장비"):
        return []
    cats = {c for c in (_item_category(p["code"], p["name"]) for p in products) if c}
    if not agency or MED_AGENCY.search(agency) or MED_TITLE.search(t):
        c = _word_category(t)
        if c:
            cats.add(c)
        elif not cats and HOSPITAL_AGENCY.search(agency) and re.search(r"(기|장비|장치|시스템)$|장비|장치", t):
            cats.add("기타 의료장비")
    if len(cats) > 1:
        cats.discard("기타 의료장비")
    return sorted(cats, key=BID_CATEGORY_NAMES.index)


def _fmt_dt(v) -> Optional[str]:
    """'2026-11-11 07:25:12' · '202611111800' · '20261111' → 'YYYY-MM-DD[ HH:MM]'. 없으면 None."""
    s = str(v or "").strip()
    m = re.match(r"^(\d{4})-?(\d{2})-?(\d{2})(?:[ T]?(\d{2}):?(\d{2}))?", s)
    if not m:
        return None
    y, mo, d, h, mi = m.groups()
    return f"{y}-{mo}-{d}" + (f" {h}:{mi}" if h else "")


def _amount(v) -> Optional[int]:
    # 9원·1원 같은 자리 값은 가격이 아니다(MEDIDOCS 점검)
    try:
        n = int(float(str(v)))
    except (TypeError, ValueError):
        return None
    return n if n >= 10_000 else None


def _won(v) -> Optional[str]:
    n = _amount(v)
    return f"{n:,}원" if n else None


def _g2b_row(item: dict) -> Optional[tuple]:
    """나라장터 물품 공고 하나 → (차수, 저장할 행). 의료장비 공고가 아니면 None."""
    raw_no = str(item.get("bidNtceNo") or "").strip()
    title = (item.get("bidNtceNm") or "").strip()
    agency = (item.get("dminsttNm") or item.get("ntceInsttNm") or "").strip()   # 수요기관(없으면 공고기관)
    products = _parse_products(item.get("purchsObjPrdctList"))
    if not products and item.get("dtilPrdctClsfcNo"):
        products = [{"code": str(item["dtilPrdctClsfcNo"]), "name": (item.get("dtilPrdctClsfcNoNm") or "").strip()}]
    cats = classify_bid(title, agency, products)
    if not raw_no or not cats:
        return None
    ord_ = str(item.get("bidNtceOrd") or "000").strip()
    files = []
    for i in range(1, 11):
        fname = (item.get(f"ntceSpecFileNm{i}") or "").strip()
        furl = (item.get(f"ntceSpecDocUrl{i}") or "").strip()
        if fname and furl:
            files.append({"name": fname, "url": furl})
    amount = _amount(item.get("presmptPrce")) or _amount(item.get("asignBdgtAmt"))
    ofcl = " · ".join(x for x in (item.get("ntceInsttOfclNm"), item.get("ntceInsttOfclTelNo"),
                                  item.get("ntceInsttOfclEmailAdrs")) if x)
    dlvr = _fmt_dt(item.get("dlvrTmlmtDt")) or (f"계약 후 {item['dlvrDaynum']}일" if item.get("dlvrDaynum") else None)
    info = [
        ("공고번호", f"{raw_no}-{ord_}"), ("공고종류", item.get("ntceKindNm")), ("공고기관", item.get("ntceInsttNm")),
        ("수요기관", item.get("dminsttNm")), ("입찰방식", item.get("bidMethdNm")),
        ("계약방법", item.get("cntrctCnclsMthdNm")), ("낙찰방법", item.get("sucsfbidMthdNm")),
        ("공동수급", item.get("cmmnSpldmdMethdNm")), ("국제입찰", "예" if item.get("intrbidYn") == "Y" else None),
        ("추정가격", _won(item.get("presmptPrce"))), ("배정예산", _won(item.get("asignBdgtAmt"))),
        ("부가세", _won(item.get("VAT"))), ("공고일시", _fmt_dt(item.get("bidNtceDt"))),
        ("참가자격 등록마감", _fmt_dt(item.get("bidQlfctRgstDt"))), ("입찰 개시", _fmt_dt(item.get("bidBeginDt"))),
        ("입찰 마감", _fmt_dt(item.get("bidClseDt"))), ("개찰일시", _fmt_dt(item.get("opengDt"))),
        ("개찰장소", item.get("opengPlce")), ("납품기한", dlvr), ("담당자", ofcl), ("변경사유", item.get("chgNtceRsn")),
    ]
    detail = {
        "info": [[k, str(v).strip()] for k, v in info if v and str(v).strip()],
        "products": [{**p, "medical": _item_category(p["code"], p["name"]) is not None} for p in products],
    }
    return ord_, {
        "bid_no": f"g2b_{raw_no}", "source": "G2B", "title": title, "agency": agency or "미확인",
        "budget": f"{amount:,}원" if amount else "미정",
        "start_date": _fmt_dt(item.get("bidBeginDt")) or "미정",
        "end_date": _fmt_dt(item.get("bidClseDt")) or "미정",
        "url": (item.get("bidNtceDtlUrl") or "").strip()
        or f"https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo={raw_no}&bidPbancOrd={ord_}",
        "files_json": json.dumps(files, ensure_ascii=False) if files else None,
        "category": ",".join(cats), "items": ", ".join(p["name"] for p in products) or None,
        "notice_date": _fmt_dt(item.get("bidNtceDt")), "budget_amount": amount,
        "notice_kind": item.get("ntceKindNm") or None, "detail_json": json.dumps(detail, ensure_ascii=False),
    }


def _g2b_page(key: str, page: int, start: str, end: str) -> tuple:
    url = (f"{G2B_LIST_URL}?ServiceKey={key}&pageNo={page}&numOfRows=100&type=json"
           f"&inqryDiv=1&inqryBgnDt={start}&inqryEndDt={end}")
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    j = resp.json()
    if "response" not in j:   # 오류는 HTTP 200 + {"nkoneps.com.response.ResponseError": {header}} 로 온다
        raise ValueError(str(j)[:200])
    body = j["response"].get("body") or {}
    items = body.get("items") or []
    return (items if isinstance(items, list) else [items]), int(body.get("totalCount") or 0)


def _fetch_g2b_bids(fetch_page=_g2b_page, now: Optional[datetime] = None) -> list:
    """최근 BID_DAYS일 물품 공고를 7일씩 나눠 모두 받아 의료장비만 남긴다. 같은 공고번호는 마지막 차수만."""
    if not G2B_API_KEY:
        return []
    key = quote(G2B_API_KEY, safe="")
    now = now or datetime.now()
    latest = {}
    for offset in range(0, BID_DAYS, 7):
        end = now - timedelta(days=offset)
        start = end - timedelta(days=min(7, BID_DAYS - offset) - 1)
        page, fetched = 1, 0
        try:
            while True:
                items, total = fetch_page(key, page, start.strftime("%Y%m%d") + "0000", end.strftime("%Y%m%d") + "2359")
                for item in items:
                    got = _g2b_row(item)
                    if got and (got[1]["bid_no"] not in latest or got[0] > latest[got[1]["bid_no"]][0]):
                        latest[got[1]["bid_no"]] = got
                fetched += len(items)
                if not items or fetched >= total:
                    break
                page += 1
        except Exception:
            pass   # 한 구간이 실패해도 받은 것과 나머지 구간은 살린다
    return [row for _, row in latest.values()]


def _scrape_d2b_files(detail_url: str) -> list:
    files = []
    try:
        r = requests.get(detail_url, headers={
            "User-Agent": D2B_HEADERS["User-Agent"],
            "Referer": "https://www.d2b.go.kr/pdb/bid/goodsBidAnnounceList.do",
        }, timeout=15)
        soup = BeautifulSoup(r.text, "html.parser")
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            name = a.get_text(strip=True)
            if "downloadSes.do" in href and name:
                full = "https://www.d2b.go.kr" + href if href.startswith("/") else href
                files.append({"name": name, "url": full})
    except Exception:
        pass
    return files


def _d2b_page(keyword: str, page: int, date_from: str, date_to: str) -> tuple:
    data = {"date_divs": "1", "date_from": date_from, "date_to": date_to, "anmt_name": keyword,
            "exct_divs": "B", "currentPageNo": str(page)}
    resp = requests.post(D2B_LIST_URL, data=data, headers=D2B_HEADERS, timeout=30)
    resp.raise_for_status()
    j = resp.json()
    return j.get("list") or [], int(j.get("totlCnt") or 0)


def _d2b_row(item: dict) -> Optional[dict]:
    """국방전자조달 물품 공고 하나 → 저장할 행. 의료장비 공고가 아니면 None."""
    dprt_code, anmt_numb = item.get("dprtCode", ""), item.get("anmtNumb", "")
    rqst_degr = str(item.get("rqstDegr") or "1")
    title = (item.get("rpstItnm") or "").strip()
    cats = classify_bid(title)   # 국방 공고는 기관 이름(국군○○)으로 거르지 않는다
    if not anmt_numb or not cats:
        return None
    params = {"dprt_code": dprt_code, "anmt_divs": item.get("anmtDivs", ""), "anmt_numb": anmt_numb,
              "rqst_degr": rqst_degr, "dcsn_numb": item.get("dcsnNumb", ""), "rqst_year": item.get("rqstYear", ""),
              "pageDivs": "G1", "bid_divs": "bid", "lv2Divs": item.get("lv2Divs", "1")}
    amount = _amount(item.get("bsicExpt"))
    openg = _fmt_dt(f"{item.get('bidxDate') or ''}{item.get('bidxTime') or ''}")
    info = [("공고번호", f"{anmt_numb}-{rqst_degr}"), ("공고구분", item.get("codeVld1")), ("발주기관", item.get("codeVld3")),
            ("계약방법", item.get("codeVld4")), ("입찰형태", item.get("codeVld2")), ("기초예가", _won(item.get("bsicExpt"))),
            ("공고일자", _fmt_dt(item.get("anmtDate"))), ("입찰 마감", _fmt_dt(item.get("bidxEndt"))), ("개찰일시", openg)]
    return {
        "bid_no": f"d2b_{dprt_code}_{anmt_numb}_{rqst_degr}", "source": "D2B", "title": title,
        "agency": item.get("codeVld3") or "국군기관",
        "budget": f"{amount:,}원" if amount else "미정",
        "start_date": _fmt_dt(item.get("anmtDate")) or "미정",
        "end_date": _fmt_dt(item.get("bidxEndt")) or "미정", "url": D2B_DETAIL_URL + "?" + urlencode(params),
        "category": ",".join(cats), "notice_date": _fmt_dt(item.get("anmtDate")), "budget_amount": amount,
        "notice_kind": item.get("codeVld1") or None,
        "detail_json": json.dumps({"info": [[k, str(v)] for k, v in info if v and str(v).strip() not in ("", "-")],
                                   "products": []}, ensure_ascii=False),
    }


def _fetch_d2b_bids(fetch_page=_d2b_page, now: Optional[datetime] = None, scrape_files=None) -> list:
    """국방전자조달 물품 공고를 의료 낱말로 검색해(한 쪽 20건, 쪽마다 넘김) 의료장비만 남긴다.
    2026-11 사이트 개편으로 목록 주소가 getGoodsBidAnnounceListNew.json, 상세가 bidAnnounceView.do 로 바뀌었다
    (예전 주소는 404 — 그동안 0건이었던 이유)."""
    scrape_files = scrape_files or _scrape_d2b_files
    now = now or datetime.now()
    date_from = (now - timedelta(days=30)).strftime("%Y%m%d")
    date_to = (now + timedelta(days=90)).strftime("%Y%m%d")
    rows = {}
    for keyword in D2B_KEYWORDS:
        page, fetched = 1, 0
        try:
            while page <= D2B_MAX_PAGES:
                items, total = fetch_page(keyword, page, date_from, date_to)
                for item in items:
                    row = _d2b_row(item)
                    if row:
                        rows.setdefault(row["bid_no"], row)
                fetched += len(items)
                if not items or fetched >= total:
                    break
                page += 1
        except Exception:
            pass   # 한 낱말이 실패해도 나머지는 받는다
    for row in rows.values():
        files = scrape_files(row["url"])
        row["files_json"] = json.dumps(files, ensure_ascii=False) if files else None
    return list(rows.values())


def _fetch_g2b_files_api(bid_ntce_no: str) -> list:
    if not G2B_API_KEY:
        return []
    try:
        key = quote(G2B_API_KEY, safe="")
        url = (f"{G2B_FILE_URL}?ServiceKey={key}&bidNtceNo={bid_ntce_no}&bidNtceDtlSeNo=00&type=json")
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        body = resp.json().get("response", {}).get("body", {})
        items = body.get("items", [])
        if not items:
            return []
        if isinstance(items, dict):
            items = [items]
        files = []
        for item in items:
            fname = (item.get("fileNm") or "").strip()
            fpath = (item.get("filePath") or "").strip()
            if fname and fpath:
                files.append({"name": fname, "url": fpath})
        return files
    except Exception:
        return []


async def _save_bids(db: AsyncSession, bids: list):
    for bid in bids:
        try:
            existing = (await db.execute(select(Bid).where(Bid.bid_no == bid["bid_no"]))).scalar_one_or_none()
            if existing:
                for k, v in bid.items():
                    if k != "bid_no" and not (k == "files_json" and v is None):
                        setattr(existing, k, v)
            else:
                db.add(Bid(created_at=datetime.now().isoformat(), **bid))
        except Exception:
            pass
    await db.commit()


async def refresh_bids_job():
    loop = asyncio.get_event_loop()
    g2b = await loop.run_in_executor(None, _fetch_g2b_bids)
    d2b = await loop.run_in_executor(None, _fetch_d2b_bids)
    async with AsyncSessionLocal() as db:
        await _save_bids(db, g2b + d2b)


def _url_hash(url: str) -> str:
    parsed = urlparse(url.strip().lower())
    qs = {k: v for k, v in parse_qs(parsed.query).items() if not k.startswith("utm_")}
    clean = urlunparse(parsed._replace(query=urlencode(qs, doseq=True)))
    return hashlib.sha256(clean.encode()).hexdigest()


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text or "").strip()


def _news_should_skip(title: str) -> bool:
    t = title.lower()
    return any(kw in t for kw in _NEWS_SKIP_KW)


def _fetch_medicaltimes_rss() -> list:
    results = []
    try:
        rss_url = "https://news.google.com/rss/search?q=site:medicaltimes.com&hl=ko&gl=KR&ceid=KR:ko"
        feed = feedparser.parse(rss_url)
        rank = 1
        for entry in feed.entries:
            if rank > 5:
                break
            raw = entry.get("title", "")
            title = (_strip_html(raw).replace(" - 메디칼타임즈", "").replace(" - MedicalTimes", "").strip())
            link = entry.get("link", "")
            if not title or not link or _news_should_skip(title):
                continue
            h = _url_hash(link)
            results.append({"url_hash": h, "title": title, "link": link,
                             "source": "MedicalTimes", "thumbnail": None, "rank": rank})
            rank += 1
    except Exception:
        pass
    return results[:5]


def _fetch_doctorsnews_popular() -> list:
    results = []
    try:
        headers = {"User-Agent": "Mozilla/5.0 Chrome/120"}
        resp = requests.get("https://www.doctorsnews.co.kr/", headers=headers, timeout=12)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for box in soup.select("div.index-columns article.box-skin"):
            header = box.find("strong", class_="user-point3")
            if not header or "많이" not in header.get_text():
                continue
            for li in box.select("ul li")[:5]:
                a = li.find("a", href=True)
                if not a:
                    continue
                title = _strip_html(a.get_text()).strip()
                href = a["href"]
                if not href.startswith("http"):
                    href = "https://www.doctorsnews.co.kr" + href
                if not title or len(title) < 5 or _news_should_skip(title):
                    continue
                num_el = li.find("div", class_="number")
                rank = int(num_el.get_text(strip=True)) if num_el else len(results) + 1
                img = li.find("img")
                thumb = None
                if img:
                    thumb = img.get("src") or img.get("data-src")
                    if thumb and not thumb.startswith("http"):
                        thumb = "https://www.doctorsnews.co.kr" + thumb
                h = _url_hash(href)
                results.append({"url_hash": h, "title": title, "link": href,
                                "source": "의협신문", "thumbnail": thumb, "rank": rank})
            break
    except Exception:
        pass
    return results[:5]


async def _save_news(db: AsyncSession, articles: list):
    inserted = 0
    for art in articles:
        try:
            existing = (await db.execute(select(NewsArticle).where(NewsArticle.url_hash == art["url_hash"]))).scalar_one_or_none()
            if existing:
                continue
            db.add(NewsArticle(created_at=datetime.now().isoformat(), **art))
            inserted += 1
        except Exception:
            pass
    await db.commit()
    return inserted


async def refresh_news_job():
    loop = asyncio.get_event_loop()
    mt = await loop.run_in_executor(None, _fetch_medicaltimes_rss)
    dn = await loop.run_in_executor(None, _fetch_doctorsnews_popular)
    async with AsyncSessionLocal() as db:
        await _save_news(db, mt + dn)


# ────────────────────────────────────────────────────────
# 입찰정보 API — 레거시와 동일 (나라장터 G2B + 국방전자조달 D2B 자동수집, 수동등록 없음)
# ────────────────────────────────────────────────────────
def _parse_files(files_json) -> list:
    """files_json(JSON 문자열) → [{name, url}] 배열. 깨졌거나 비어있으면 []."""
    if not files_json:
        return []
    try:
        data = json.loads(files_json)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    return [
        {"name": str(f["name"]).strip(), "url": str(f["url"]).strip()}
        for f in data
        if isinstance(f, dict) and f.get("name") and f.get("url")
    ]


def _bid_out(b: Bid, today) -> dict:
    days_left = None
    expires_soon = False
    try:
        if b.end_date:
            end = datetime.strptime(b.end_date[:10], "%Y-%m-%d").date()
            days_left = (end - today).days
            expires_soon = 0 <= days_left <= 3
    except Exception:
        pass
    try:
        detail = json.loads(b.detail_json) if b.detail_json else None
    except Exception:
        detail = None
    return {
        "id": b.id, "bid_no": b.bid_no, "source": b.source, "title": b.title, "agency": b.agency,
        "budget": b.budget, "start_date": b.start_date, "end_date": b.end_date, "url": b.url,
        "files_json": b.files_json, "files": _parse_files(b.files_json),
        "days_left": days_left, "expires_soon": expires_soon,
        "categories": [c for c in (b.category or "").split(",") if c], "items": b.items,
        "notice_date": b.notice_date, "budget_amount": b.budget_amount, "notice_kind": b.notice_kind, "detail": detail,
    }


def _open_clause(now: datetime):
    """마감 전(마감일시가 지금 이후, 날짜만 있으면 오늘까지, '미정' 포함), 취소공고 제외"""
    now_s, today_s = now.strftime("%Y-%m-%d %H:%M"), now.strftime("%Y-%m-%d")
    return and_(or_(Bid.end_date >= now_s, Bid.end_date == today_s),
                or_(Bid.notice_kind.is_(None), Bid.notice_kind != "취소공고"))


@router.get("/bids")
async def get_bids(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    source: str = "",
    search: str = "",
    category: str = "",
    status: str = "open",   # open(마감 전) | closed(마감) | all
    sort: str = "notice",   # notice(최신 공고) | deadline(마감 임박) | budget(추정가격 높은 순)
    page: int = 1,
    size: int = 30,
):
    now = datetime.now()
    # 의료장비 분류가 없는 행(예전 수집기가 낱말만 보고 넣은 동물용·보안검색 X선 등)은 보이지 않는다
    medical = func.coalesce(Bid.category, "") != ""
    conds = [medical]
    if source:
        conds.append(Bid.source == source.upper())
    if search:
        s = f"%{search.strip()}%"
        conds.append(or_(Bid.title.ilike(s), Bid.agency.ilike(s), Bid.items.ilike(s), Bid.bid_no.ilike(s)))
    if status == "open":
        conds.append(_open_clause(now))
    elif status == "closed":
        conds.append(not_(_open_clause(now)))

    # 분류 칩 숫자: 분류만 빼고 같은 조건
    category_counts = {}
    for (cats,) in (await db.execute(select(Bid.category).where(*conds))).all():
        for c in (cats or "").split(","):
            if c:
                category_counts[c] = category_counts.get(c, 0) + 1

    if category:
        conds.append(("," + func.coalesce(Bid.category, "") + ",").like(f"%,{category},%"))
    q = select(Bid).where(*conds)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    if sort == "deadline":
        order = [Bid.end_date.asc().nulls_last(), Bid.id.desc()]
    elif sort == "budget":
        order = [Bid.budget_amount.desc().nulls_last(), Bid.id.desc()]
    else:
        order = [func.coalesce(Bid.notice_date, Bid.created_at).desc(), Bid.id.desc()]
    page_rows = (await db.execute(q.order_by(*order).offset((page - 1) * size).limit(size))).scalars().all()

    # 위쪽 요약 숫자(출처·검색과 상관없이 전체)
    open_c = and_(medical, _open_clause(now))
    soon_s = (now + timedelta(days=3)).strftime("%Y-%m-%d 23:59")
    async def count(*where) -> int:
        return (await db.execute(select(func.count()).select_from(Bid).where(*where))).scalar_one()

    summary = {
        "open": await count(open_c),
        "closing_soon": await count(open_c, Bid.end_date <= soon_s),
        "new_today": await count(medical, Bid.notice_date >= now.strftime("%Y-%m-%d")),
    }
    today = now.date()
    return {
        "total": total, "page": page, "size": size, "items": [_bid_out(b, today) for b in page_rows],
        "category_counts": [{"name": c, "count": category_counts[c]} for c in BID_CATEGORY_NAMES if c in category_counts],
        "summary": summary,
    }


@router.get("/bids/{bid_id}")
async def get_bid_detail(bid_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    b = (await db.execute(select(Bid).where(Bid.id == bid_id))).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="입찰 정보를 찾을 수 없습니다")
    return _bid_out(b, datetime.now().date())


@router.post("/bids/{bid_id}/refresh-files")
async def refresh_bid_files(bid_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    b = (await db.execute(select(Bid).where(Bid.id == bid_id))).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="입찰 정보를 찾을 수 없습니다")
    if b.source == "G2B":
        raw_no = b.bid_no.replace("g2b_", "")
        loop = asyncio.get_event_loop()
        files = await loop.run_in_executor(None, _fetch_g2b_files_api, raw_no)
        b.files_json = json.dumps(files, ensure_ascii=False) if files else None
        await db.commit()
    return {"id": b.id, "files_json": b.files_json}


@router.post("/admin/refresh-bids")
async def admin_refresh_bids(user: User = Depends(require_admin)):
    asyncio.create_task(refresh_bids_job())
    return {"ok": True, "message": "입찰정보 갱신 시작"}


# ────────────────────────────────────────────────────────
# 의료소식 API — 레거시와 동일 (MedicalTimes RSS + 의협신문 스크래핑, 수동등록 없음)
# ────────────────────────────────────────────────────────
@router.get("/news")
async def get_news(db: AsyncSession = Depends(get_db), source: str = "", page: int = 1, size: int = 30):
    q = select(NewsArticle)
    if source:
        q = q.where(NewsArticle.source == source)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    page_rows = (
        await db.execute(
            q.order_by(NewsArticle.created_at.desc(), NewsArticle.rank.asc()).offset((page - 1) * size).limit(size)
        )
    ).scalars().all()
    items = [{
        "id": n.id, "title": n.title, "link": n.link, "source": n.source,
        "thumbnail": n.thumbnail, "rank": n.rank, "created_at": n.created_at,
    } for n in page_rows]
    return {"total": total, "page": page, "size": size, "items": items}


@router.post("/admin/refresh-news")
async def admin_refresh_news(user: User = Depends(require_admin)):
    asyncio.create_task(refresh_news_job())
    return {"ok": True, "message": "의료소식 갱신 시작"}
