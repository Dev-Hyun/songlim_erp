"""입찰정보 — 의료장비 분류(제목 + 구매대상물품)와 목록 API."""
import json
from datetime import datetime, timedelta

import pytest

from app.models import Bid, User
from app.routers import bids_news as bn
from app.security import hash_password

# 2026-11-12 나라장터 실제 응답에서 가져온 형식
VULNERABLE_ER = "[1^4220189901^디지털진단용엑스선촬영장치],[1^4220189701^포터블엑스선촬영장치]"


def test_parse_products():
    assert bn._parse_products(VULNERABLE_ER + ",[2^4220189701^포터블엑스선촬영장치]") == [
        {"code": "4220189901", "name": "디지털진단용엑스선촬영장치"},
        {"code": "4220189701", "name": "포터블엑스선촬영장치"},
    ]
    assert bn._parse_products(None) == []


def test_title_match():
    assert bn.classify_bid("영상의학과 초음파영상진단기 1SET", "의료법인한전의료재단한일병원") == ["초음파"]


def test_generic_title_found_by_purchased_items():
    """제목에 장비 이름이 없고(취약지 응급의료기관 장비지원) 물품에만 X선 장비가 있는 공고"""
    title, agency = "취약지응급의료기관 장비지원사업", "의료법인 이도의료재단"
    assert bn.classify_bid(title, agency) == []   # 제목만으로는 못 잡는다
    products = bn._parse_products(VULNERABLE_ER + ",[1^4227220901^인공호흡기],[1^4220171201^초음파영상진단장치]")
    assert bn.classify_bid(title, agency, products) == ["X-ray", "초음파", "생명유지·마취"]


def test_non_medical_excluded():
    food = bn._parse_products("[1^5017190501^단무지],[1^5017199801^김치]")
    assert bn.classify_bid("단무지 1식", "각 수요기관", food) == []
    # 물품분류 42여도 소모품·동물용은 장비가 아니다
    assert bn.classify_bid("2026년 진료소모품 구매", "OO병원", bn._parse_products("[1^4231170801^반창고]")) == []
    assert bn.classify_bid("장비 구매", "OO대학교", bn._parse_products("[1^4212961901^동물용초음파영상진단장치]")) == []
    # 의료기관이 아닌 곳의 제목 낱말(산업용 초음파)은 의료 낱말이 없으면 거른다
    assert bn.classify_bid("초음파 두께측정기 구매", "한국전력공사") == []


def test_item_family_beats_misleading_words():
    assert bn.classify_bid("세척기 구매", "OO병원", bn._parse_products("[1^4228171201^초음파세척기]")) == ["멸균·소독"]
    assert bn.classify_bid("분석장비 구매", "OO연구원", bn._parse_products(
        "[1^4299040201^의료용분리방식임상화학자동분석장치]")) == ["검사장비"]


def _notice(no, ord_, title, products, agency="OO병원", **kw):
    return {"bidNtceNo": no, "bidNtceOrd": ord_, "bidNtceNm": title, "dminsttNm": agency, "ntceInsttNm": "조달청",
            "purchsObjPrdctList": products, "presmptPrce": "120000000", "bidNtceDt": "2026-11-10 09:00:00",
            "bidClseDt": "2026-11-20 10:00:00", "ntceKindNm": "등록공고", **kw}


def test_fetch_g2b_windows_and_latest_order(monkeypatch):
    monkeypatch.setattr(bn, "G2B_API_KEY", "test-key")
    calls = []
    pages = {
        1: [_notice("R1", "000", "취약지 응급의료기관 장비지원 사업", VULNERABLE_ER),
            _notice("R1", "001", "취약지 응급의료기관 장비지원 사업", VULNERABLE_ER, ntceKindNm="변경공고"),
            _notice("R2", "000", "단무지 1식", "[1^5017190501^단무지]")],
    }

    def fake_page(key, page, start, end):
        calls.append((start, end))
        return (pages.get(page, []) if len(calls) == 1 else []), 3

    rows = bn._fetch_g2b_bids(fetch_page=fake_page, now=datetime(2026, 11, 12, 9, 0))
    # API는 7일까지만 받는다 → 14일을 7일씩 두 번
    assert calls == [("202611060000", "202611122359"), ("202610300000", "202611052359")]
    assert len(rows) == 1
    r = rows[0]
    assert r["bid_no"] == "g2b_R1" and r["category"] == "X-ray" and r["notice_kind"] == "변경공고"
    assert r["end_date"] == "2026-11-20 10:00" and r["budget_amount"] == 120_000_000 and r["budget"] == "120,000,000원"
    detail = json.loads(r["detail_json"])
    assert ["공고번호", "R1-001"] in detail["info"]
    assert all(p["medical"] for p in detail["products"])


@pytest.mark.asyncio
async def test_bids_api_filters(client, db_session):
    now = datetime.now()
    future = (now + timedelta(days=5)).strftime("%Y-%m-%d %H:%M")
    past = (now - timedelta(days=2)).strftime("%Y-%m-%d %H:%M")
    base = dict(source="G2B", agency="OO병원", created_at=now.isoformat(), notice_date=now.strftime("%Y-%m-%d 09:00"))
    db_session.add_all([
        Bid(bid_no="t_open_xray", title="취약지 응급의료기관 장비지원", end_date=future, category="X-ray,초음파",
            items="디지털진단용엑스선촬영장치", budget_amount=5, **base),
        Bid(bid_no="t_open_us", title="초음파진단기 구매", end_date=future, category="초음파", budget_amount=9, **base),
        Bid(bid_no="t_closed_xray", title="X선 촬영장치", end_date=past, category="X-ray", **base),
        Bid(bid_no="t_cancel_xray", title="X선 촬영장치", end_date=future, category="X-ray", notice_kind="취소공고", **base),
        User(username="bidstaff1", password_hash=hash_password("pw"), display_name="직원", role="songrim",
             is_approved=True),
    ])
    await db_session.commit()
    assert (await client.post("/api/auth/login", json={"username": "bidstaff1", "password": "pw"})).status_code == 200

    body = (await client.get("/api/bids", params={"category": "X-ray"})).json()
    assert [b["bid_no"] for b in body["items"]] == ["t_open_xray"]   # 마감·취소공고 제외
    assert body["items"][0]["categories"] == ["X-ray", "초음파"]
    assert {c["name"]: c["count"] for c in body["category_counts"]} == {"X-ray": 1, "초음파": 2}

    body = (await client.get("/api/bids", params={"sort": "budget"})).json()
    assert [b["bid_no"] for b in body["items"]] == ["t_open_us", "t_open_xray"]

    body = (await client.get("/api/bids", params={"search": "엑스선촬영"})).json()   # 구매대상물품으로 검색
    assert [b["bid_no"] for b in body["items"]] == ["t_open_xray"]

    body = (await client.get("/api/bids", params={"status": "closed", "category": "X-ray"})).json()
    assert {b["bid_no"] for b in body["items"]} == {"t_closed_xray", "t_cancel_xray"}
    await client.post("/api/auth/logout")


def test_d2b_collects_medical_only_pages_through_and_builds_detail():
    """국방전자조달: 쪽을 넘겨 다 받고, 의료장비 공고만 남긴다(2026-11-12 실제 응답 형식)."""
    def item(n, title):
        return {"lv2Divs": "1", "anmtDivs": "D", "codeVld1": "재공고", "anmtNumb": f"LCF06{n:02d}", "rqstYear": "2026",
                "rqstDegr": "2", "anmtDate": "20261106", "dcsnNumb": "36658", "rpstItnm": title, "dprtCode": "LCF",
                "codeVld3": "국군의무사령부", "codeVld4": "제한경쟁", "codeVld2": "총액제", "bsicExpt": 21910340,
                "bidxEndt": "202611201000", "bidxDate": "20261120", "bidxTime": "1030"}
    pages = {1: [item(1, "디지털 엑스선 촬영장치 1식"), item(2, "나프탈렌(화장실용) 등 26항목 구매(의무)")],
             2: [item(3, "초음파진단기 2대")]}
    calls = []

    def fetch(keyword, page, date_from, date_to):
        calls.append((keyword, page))
        return (pages.get(page, []), 3) if keyword == "의무" else ([], 0)

    rows = bn._fetch_d2b_bids(fetch_page=fetch, now=datetime(2026, 11, 12), scrape_files=lambda url: [])
    assert ("의무", 2) in calls and ("의무", 3) not in calls     # 3건이면 2쪽에서 멈춤
    assert sorted(r["category"] for r in rows) == ["X-ray", "초음파"]   # 나프탈렌은 빠짐
    xr = next(r for r in rows if r["category"] == "X-ray")
    assert xr["url"].startswith("https://www.d2b.go.kr/pdb/bid/bidAnnounceView.do?") and "anmt_numb=LCF0601" in xr["url"]
    assert xr["end_date"] == "2026-11-20 10:00" and xr["budget_amount"] == 21910340 and xr["notice_kind"] == "재공고"
    info = dict(json.loads(xr["detail_json"])["info"])
    assert info["공고번호"] == "LCF0601-2" and info["개찰일시"] == "2026-11-20 10:30" and info["기초예가"] == "21,910,340원"
