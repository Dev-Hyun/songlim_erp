"""판매계약서 OCR 파서 회귀 테스트.

fixtures/contract_ocr_sample.json은 실제 계약서 사진을 클로바 OCR에 넣어 받은 응답을
[텍스트, x1, y1, x2, y2] 형태로 줄인 것이다. 파서는 글자 내용이 아니라 좌표(칸 배치)로 동작하므로
매수자 정보(병원명/사업자번호/대표자/주소/계좌번호)는 좌표를 그대로 둔 채 가상값으로 바꿔 두었다 —
실제 고객 정보를 저장소에 남기지 않으면서 파싱 로직은 동일하게 검증된다.

파서가 이 양식의 모든 칸을 정확히 집어내는지, 그리고 빈 칸(전화번호/휴대폰/팩스/고객요구사항)에
옆 라벨 글자가 값으로 새어 들어가지 않는지 검증한다.
"""
import json
import os

from app.clova_ocr import parse_contract

FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "contract_ocr_sample.json")


def _fields() -> list[dict]:
    rows = json.load(open(FIXTURE, encoding="utf-8"))
    return [
        {
            "inferText": text,
            "boundingPoly": {"vertices": [{"x": x1, "y": y1}, {"x": x2, "y": y1}, {"x": x2, "y": y2}, {"x": x1, "y": y2}]},
        }
        for text, x1, y1, x2, y2 in rows
    ]


def test_parse_contract_matches_document():
    parsed = parse_contract(_fields())["parsed"]

    assert parsed["contract_date"] == "2026-05-19"
    assert parsed["buyer_hospital"] == "튼튼서울내과의원"
    assert parsed["buyer_biz_no"] == "123-45-67890"
    assert parsed["buyer_rep"] == "홍길동"
    assert parsed["buyer_address"] == "충북 가상군 가상읍 가상로 31"
    assert parsed["sale_amount"] == 19_000_000
    assert parsed["sale_amount_note"] == "VAT 포함"
    assert parsed["etc_note"] == "계약금 (10%)"
    assert parsed["install_date"] == "2026-05-19"  # 손글씨 "2026.5.19"
    assert parsed["payment_account"] == "(농협) 111-22-333333"
    assert parsed["account_holder"] == "송림메디칼(주)"


def test_parse_contract_items():
    parsed = parse_contract(_fields())["parsed"]
    items = parsed["items"]

    assert [i["name"] for i in items] == ["Rayence 1717 SCC", "Console PC & Monitor"]
    assert [i["qty"] for i in items] == ["2D", "1 Set"]
    # 비고는 표 전체를 가로지르는 병합 셀이라 첫 품목에 붙는다
    assert items[0]["note"] == "Detector 1D는 Used"
    # 표 왼쪽 세로 안내 글자("계약조건")가 품목명으로 새어 들어오면 안 된다
    assert all(i["name"] not in ("계", "약", "조", "건") for i in items)


def test_blank_cells_stay_blank():
    """빈 칸에 옆 라벨 텍스트("휴 대 폰 팩 스")가 값으로 들어가던 회귀를 막는다."""
    parsed = parse_contract(_fields())["parsed"]

    for key in ("buyer_phone", "buyer_mobile", "buyer_fax", "customer_request"):
        assert key not in parsed, f"{key}는 계약서에서 빈 칸이므로 값이 없어야 한다 (실제: {parsed.get(key)!r})"
