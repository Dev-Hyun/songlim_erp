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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, get_db
from app.models import Bid, NewsArticle, User
from app.routers.admin import require_admin
from app.routers.auth import require_staff

router = APIRouter(prefix="/api", tags=["bids_news"])

G2B_API_KEY = os.environ.get("G2B_API_KEY", "")
G2B_LIST_URL = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoThng"
G2B_FILE_URL = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoThngFile"
D2B_LIST_URL = "https://www.d2b.go.kr/pdb/bid/goodsBidAnnounceListJson.do"
D2B_DETAIL_URL = "https://www.d2b.go.kr/pdb/bid/goodsBidAnnounceDetail.do"
D2B_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.d2b.go.kr/pdb/bid/goodsBidAnnounceList.do?key=13",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
}
BID_INCLUDE = ["x선기", "x-선기", "x선 촬영", "x-ray", "방사선 발생", "방사선촬영", "방사선검사장비", "방사선장비",
               "디지털방사선", "dr장비", "촬영장치", "c-arm", "c arm", "씨암", "수술용 방사선", "초음파진단기",
               "초음파 진단기", "초음파진단", "초음파영상진단", "초음파 영상진단", "초음파장비"]
BID_EXCLUDE = ["세척기", "탐지기", "소모품", "시험세트", "필름", "현상", "겔", "젤"]
D2B_KEYWORDS = ["방사선", "X선기", "초음파진단", "의무장비"]

_NEWS_SKIP_KW = ["부음", "부고", "조모상", "조부상", "부친상", "모친상", "별세", "타계", "숙환"]


def _bid_is_target(title: str) -> bool:
    t = title.lower()
    if any(p in t for p in BID_EXCLUDE):
        return False
    return any(p in t for p in BID_INCLUDE)


def _fmt_date(dt_str) -> str:
    s = str(dt_str or "").strip()
    if not s or s in ("-", "None", "null"):
        return "미정"
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    try:
        return datetime.strptime(s[:8], "%Y%m%d").strftime("%Y-%m-%d")
    except Exception:
        return s


def _fmt_budget(price) -> str:
    if not price:
        return "미정"
    try:
        return f"{int(float(str(price))):,}원"
    except Exception:
        return str(price)


def _fetch_g2b_bids() -> list:
    if not G2B_API_KEY:
        return []
    bids, seen = [], set()
    today = datetime.now()
    start_dt = (today - timedelta(days=7)).strftime("%Y%m%d") + "0000"
    end_dt = today.strftime("%Y%m%d") + "2359"
    key = quote(G2B_API_KEY, safe="")
    page, total_fetched = 1, 0
    try:
        while True:
            url = (f"{G2B_LIST_URL}?ServiceKey={key}&pageNo={page}&numOfRows=100&type=json"
                   f"&inqryDiv=1&inqryBgnDt={start_dt}&inqryEndDt={end_dt}")
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            body = resp.json().get("response", {}).get("body", {})
            total_count = int(body.get("totalCount", 0) or 0)
            items = body.get("items", [])
            if not items:
                break
            if isinstance(items, dict):
                items = [items]
            for item in items:
                bid_no = f"g2b_{str(item.get('bidNtceNo', '')).strip()}"
                title = item.get("bidNtceNm", "")
                if not bid_no or bid_no in seen or not _bid_is_target(title):
                    continue
                seen.add(bid_no)
                agency = item.get("dmndInsttNm") or item.get("ntceInsttNm") or "미확인"
                raw_no = bid_no.replace("g2b_", "")
                detail_url = (f"https://www.g2b.go.kr/wf/?p=/xml/bid/pubAnnouncement/bidNoticeDetail.xml"
                              f"&bidNtceNo={raw_no}&bidNtceDtlSeNo=00")
                files = []
                for i in range(1, 11):
                    fname = (item.get(f"ntceSpecFileNm{i}") or "").strip()
                    furl = (item.get(f"ntceSpecDocUrl{i}") or "").strip()
                    if fname and furl:
                        files.append({"name": fname, "url": furl})
                bids.append({
                    "bid_no": bid_no, "source": "G2B", "title": title, "agency": agency,
                    "budget": _fmt_budget(item.get("presmptPrce")),
                    "start_date": _fmt_date(item.get("bidBeginDt")),
                    "end_date": _fmt_date(item.get("bidClseDt")),
                    "url": detail_url,
                    "files_json": json.dumps(files, ensure_ascii=False) if files else None,
                })
            total_fetched += len(items)
            if total_fetched >= total_count:
                break
            page += 1
    except Exception:
        pass
    return bids


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


def _fetch_d2b_bids() -> list:
    bids, seen = [], set()
    today = datetime.now()
    date_from = (today - timedelta(days=30)).strftime("%Y%m%d")
    date_to = (today + timedelta(days=90)).strftime("%Y%m%d")
    for keyword in D2B_KEYWORDS:
        try:
            data = {"date_divs": "1", "date_from": date_from, "date_to": date_to, "anmt_name": keyword,
                    "exct_divs": "B", "currentPageNo": "1", "pageUnit": "50"}
            resp = requests.post(D2B_LIST_URL, data=data, headers=D2B_HEADERS, timeout=30)
            resp.raise_for_status()
            for item in resp.json().get("list", []):
                dprt_code = item.get("dprtCode", "")
                anmt_numb = item.get("anmtNumb", "")
                rqst_degr = item.get("rqstDegr", "1")
                title = item.get("rpstItnm", "")
                bid_id = f"d2b_{dprt_code}_{anmt_numb}_{rqst_degr}"
                if not anmt_numb or bid_id in seen or not _bid_is_target(title):
                    continue
                seen.add(bid_id)
                params = {"dprt_code": dprt_code, "anmt_divs": item.get("anmtDivs", ""),
                          "anmt_numb": anmt_numb, "rqst_degr": rqst_degr, "dcsn_numb": item.get("dcsnNumb", ""),
                          "rqst_year": item.get("rqstYear", ""), "pageDivs": "G1", "bid_divs": "bid",
                          "lv2Divs": item.get("lv2Divs", "1")}
                detail_url = D2B_DETAIL_URL + "?" + urlencode(params)
                files = _scrape_d2b_files(detail_url)
                bids.append({
                    "bid_no": bid_id, "source": "D2B", "title": title,
                    "agency": item.get("codeVld3", "국군기관"),
                    "budget": _fmt_budget(item.get("bsicExpt")),
                    "start_date": _fmt_date(item.get("anmtDate")),
                    "end_date": _fmt_date(item.get("bidxEndt")), "url": detail_url,
                    "files_json": json.dumps(files, ensure_ascii=False) if files else None,
                })
        except Exception:
            pass
    return bids


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
                existing.url = bid["url"]
                existing.title = bid["title"]
                existing.agency = bid["agency"]
                existing.budget = bid["budget"]
                existing.start_date = bid["start_date"]
                existing.end_date = bid["end_date"]
                if bid.get("files_json") is not None:
                    existing.files_json = bid["files_json"]
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
@router.get("/bids")
async def get_bids(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
    source: str = "",
    search: str = "",
    page: int = 1,
    size: int = 30,
):
    q = select(Bid)
    if source:
        q = q.where(Bid.source == source.upper())
    if search:
        q = q.where((Bid.title.ilike(f"%{search}%")) | (Bid.agency.ilike(f"%{search}%")))
    rows = (await db.execute(q.order_by(Bid.created_at.desc()))).scalars().all()
    total = len(rows)
    page_rows = rows[(page - 1) * size: (page - 1) * size + size]
    today = datetime.now().date()
    items = []
    for b in page_rows:
        days_left = None
        expires_soon = False
        try:
            if b.end_date:
                end = datetime.strptime(b.end_date[:10], "%Y-%m-%d").date()
                days_left = (end - today).days
                expires_soon = 0 <= days_left <= 3
        except Exception:
            pass
        items.append({
            "id": b.id, "bid_no": b.bid_no, "source": b.source, "title": b.title, "agency": b.agency,
            "budget": b.budget, "start_date": b.start_date, "end_date": b.end_date, "url": b.url,
            "files_json": b.files_json, "days_left": days_left, "expires_soon": expires_soon,
        })
    return {"total": total, "page": page, "size": size, "items": items}


@router.get("/bids/{bid_id}")
async def get_bid_detail(bid_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    b = (await db.execute(select(Bid).where(Bid.id == bid_id))).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="입찰 정보를 찾을 수 없습니다")
    return {
        "id": b.id, "bid_no": b.bid_no, "source": b.source, "title": b.title, "agency": b.agency,
        "budget": b.budget, "start_date": b.start_date, "end_date": b.end_date, "url": b.url,
        "files_json": b.files_json,
    }


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
    rows = (await db.execute(q.order_by(NewsArticle.created_at.desc(), NewsArticle.rank.asc()))).scalars().all()
    total = len(rows)
    page_rows = rows[(page - 1) * size: (page - 1) * size + size]
    items = [{
        "id": n.id, "title": n.title, "link": n.link, "source": n.source,
        "thumbnail": n.thumbnail, "rank": n.rank, "created_at": n.created_at,
    } for n in page_rows]
    return {"total": total, "page": page, "size": size, "items": items}


@router.post("/admin/refresh-news")
async def admin_refresh_news(user: User = Depends(require_admin)):
    asyncio.create_task(refresh_news_job())
    return {"ok": True, "message": "의료소식 갱신 시작"}
