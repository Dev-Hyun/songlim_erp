"""네이버 클로바 OCR(General) 호출 + 판매계약서 양식 파싱.

CLOVA_OCR_INVOKE_URL / CLOVA_OCR_SECRET 환경변수가 있어야 동작한다. 응답의 각 필드는 inferText와
boundingPoly(꼭짓점 좌표)를 가지므로, 좌표로 줄을 재구성한 뒤 라벨 셀의 오른쪽 값을 뽑는 방식으로
계약 폼 필드를 채운다. OCR 특성상 100% 정확하진 않으므로 프론트에서 사용자가 검토·수정하는 것을 전제로 한다.
"""
import base64
import json
import os
import re
import time
import urllib.request

INVOKE_URL = os.environ.get("CLOVA_OCR_INVOKE_URL", "")
SECRET = os.environ.get("CLOVA_OCR_SECRET", "")


def is_configured() -> bool:
    return bool(INVOKE_URL and SECRET)


def run_ocr(image_bytes: bytes, ext: str = "jpg") -> list[dict]:
    """CLOVA General OCR 호출 → fields 리스트 반환. 각 field: {inferText, boundingPoly}."""
    fmt = "jpg" if ext.lower() in ("jpg", "jpeg") else ext.lower()
    body = json.dumps({
        "version": "V2",
        "requestId": f"songlim-{int(time.time())}",
        "timestamp": int(time.time() * 1000),
        "images": [{"format": fmt, "name": "contract", "data": base64.b64encode(image_bytes).decode()}],
    }).encode()
    req = urllib.request.Request(
        INVOKE_URL, data=body,
        headers={"Content-Type": "application/json", "X-OCR-SECRET": SECRET},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    return data["images"][0]["fields"]


# ── 파싱 유틸 ────────────────────────────────────────────────────────────

def _center(field: dict) -> tuple[float, float]:
    verts = field["boundingPoly"]["vertices"]
    xs = [v.get("x", 0) for v in verts]
    ys = [v.get("y", 0) for v in verts]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def _height(field: dict) -> float:
    ys = [v.get("y", 0) for v in field["boundingPoly"]["vertices"]]
    return max(ys) - min(ys)


def _lines(fields: list[dict]) -> list[list[dict]]:
    """y좌표로 같은 줄끼리 묶고, 각 줄은 x좌표로 정렬."""
    if not fields:
        return []
    avg_h = sum(_height(f) for f in fields) / len(fields) or 20
    tol = avg_h * 0.6
    items = sorted(fields, key=lambda f: _center(f)[1])
    lines: list[list[dict]] = []
    for f in items:
        cy = _center(f)[1]
        placed = False
        for line in lines:
            if abs(_center(line[0])[1] - cy) <= tol:
                line.append(f)
                placed = True
                break
        if not placed:
            lines.append([f])
    for line in lines:
        line.sort(key=lambda f: _center(f)[0])
    return lines


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", s)


def _tokens_in_order(lines: list[list[dict]]) -> list[str]:
    out = []
    for line in lines:
        out.extend(f["inferText"] for f in line)
    return out


def _to_date(text: str) -> str | None:
    """'2026 년 05 월 19 일' / '2026.5.19' / '2026-05-19' → 'YYYY-MM-DD'."""
    m = re.search(r"(20\d{2})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})", text)
    if not m:
        return None
    y, mo, d = m.group(1), m.group(2).zfill(2), m.group(3).zfill(2)
    return f"{y}-{mo}-{d}"


LABELS = {"병원명", "사업자등록번호", "대표자명", "주소", "전화번호", "휴대폰", "팩스",
          "계약일자", "설치희망일", "판매금액", "기타", "고객요구사항", "상품명", "수량", "비고", "매수자"}


def _value_right_of(line: list[dict], label: str) -> str | None:
    """한 줄에서 label 셀 오른쪽에 오는 셀들을 다음 라벨 전까지 합쳐 반환."""
    joined = [(_norm(f["inferText"]), f["inferText"]) for f in line]
    for i, (nt, _) in enumerate(joined):
        if label in nt or nt in label and len(nt) >= 2:
            parts = []
            for nt2, raw2 in joined[i + 1:]:
                if any(lb in nt2 for lb in LABELS):
                    break
                parts.append(raw2)
            val = " ".join(parts).strip()
            if val:
                return val
    return None


def parse_contract(fields: list[dict]) -> dict:
    """OCR fields → 계약 폼 프리필 dict. 못 찾은 값은 생략."""
    lines = _lines(fields)
    all_text = "\n".join(" ".join(f["inferText"] for f in line) for line in lines)
    flat = " ".join(_tokens_in_order(lines))
    result: dict = {}

    # 줄 단위 라벨→오른쪽 값
    for line in lines:
        for label, key in [("병원명", "buyer_hospital"), ("대표자명", "buyer_rep"),
                           ("주소", "buyer_address"), ("전화번호", "buyer_phone"),
                           ("휴대폰", "buyer_mobile"), ("팩스", "buyer_fax")]:
            if key in result:
                continue
            v = _value_right_of(line, label)
            if v:
                result[key] = v

    # 사업자등록번호 패턴
    m = re.search(r"\d{3}-\d{2}-\d{5}", flat)
    if m:
        result["buyer_biz_no"] = m.group(0)

    # 계약일자 / 설치희망일
    for line in lines:
        joined = _norm(" ".join(f["inferText"] for f in line))
        if "계약일자" in joined:
            d = _to_date(" ".join(f["inferText"] for f in line))
            if d:
                result["contract_date"] = d
        if "설치희망일" in joined:
            d = _to_date(" ".join(f["inferText"] for f in line))
            if d:
                result["install_date"] = d

    # 판매금액 (가장 큰 콤마 포함 숫자)
    amounts = [int(x.replace(",", "")) for x in re.findall(r"\d{1,3}(?:,\d{3})+", flat)]
    if amounts:
        result["sale_amount"] = max(amounts)
        if "VAT" in flat.upper() or "부가세" in flat:
            result["sale_amount_note"] = "VAT 포함"

    return {"parsed": result, "raw_text": all_text}
