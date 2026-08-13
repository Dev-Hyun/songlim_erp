"""네이버 클로바 OCR(General) 호출 + 판매계약서 양식 파싱.

CLOVA_OCR_INVOKE_URL / CLOVA_OCR_SECRET 환경변수가 있어야 동작한다. 응답의 각 필드는 inferText와
boundingPoly(꼭짓점 좌표)를 가지므로, 좌표로 줄을 재구성한 뒤 라벨 셀의 오른쪽(또는 표에서는 아래)
값을 뽑는 방식으로 계약 폼 필드를 채운다.

양식 특성상 주의할 점 두 가지:
  1) 라벨이 "주  소", "휴 대 폰"처럼 자간이 벌어져 있어 OCR이 한 글자씩 끊어 준다. 그래서 라벨은
     한 토큰과 비교하지 않고 연속 토큰을 이어붙여 찾는다(_find_label).
  2) 판매금액/기타/상품표는 값이 라벨 오른쪽이 아니라 아래 줄에 있다. 그래서 헤더 줄의 라벨 중심
     x좌표로 컬럼 경계를 만들고 아래 줄 토큰을 컬럼별로 나눈다(_columns_below).

OCR 특성상 100% 정확하진 않으므로 프론트에서 사용자가 검토·수정하는 것을 전제로 한다.
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


# ── 좌표 유틸 ────────────────────────────────────────────────────────────

def _xs(field: dict) -> list[float]:
    return [v.get("x", 0) for v in field["boundingPoly"]["vertices"]]


def _ys(field: dict) -> list[float]:
    return [v.get("y", 0) for v in field["boundingPoly"]["vertices"]]


def _center(field: dict) -> tuple[float, float]:
    xs, ys = _xs(field), _ys(field)
    return sum(xs) / len(xs), sum(ys) / len(ys)


def _height(field: dict) -> float:
    ys = _ys(field)
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


def _text(fields: list[dict]) -> str:
    return " ".join(f["inferText"] for f in fields).strip()


def _to_date(text: str) -> str | None:
    """'2026 년 05 월 19 일' / '2026.5.19' / '2026-05-19' → 'YYYY-MM-DD'."""
    m = re.search(r"(20\d{2})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})", text)
    if not m:
        return None
    y, mo, d = m.group(1), m.group(2).zfill(2), m.group(3).zfill(2)
    return f"{y}-{mo}-{d}"


# 표 왼쪽 바깥에 세로로 적힌 안내 글자("매수자", "계약조건")는 값이 아니라 장식이므로 걸러낸다.
# 한 글자씩 끊겨 들어오고 x좌표가 표 왼쪽 선보다 바깥이라 이 두 조건으로 구분한다.
_VERTICAL_LABEL_CHARS = set("매수자계약조건")
_VERTICAL_LABEL_MAX_X = 90

LABELS = ["사업자등록번호", "고객요구사항", "고객지불계좌", "설치희망일", "계약일자", "판매금액",
          "대표자명", "전화번호", "휴대폰", "병원명", "예금주", "상품명", "수량", "비고", "주소",
          "팩스", "기타", "매수자"]


def _drop_vertical_labels(line: list[dict]) -> list[dict]:
    return [
        f for f in line
        if not (len(_norm(f["inferText"])) == 1
                and _norm(f["inferText"]) in _VERTICAL_LABEL_CHARS
                and _center(f)[0] < _VERTICAL_LABEL_MAX_X)
    ]


def _find_label(line: list[dict], label: str, start: int = 0) -> tuple[int, int] | None:
    """줄에서 label을 이루는 연속 토큰 구간 [i, j]를 찾는다. 자간이 벌어져 한 글자씩 끊긴
    라벨("주"+"소")도 이어붙여 맞춘다. 못 찾으면 None."""
    for i in range(start, len(line)):
        acc = ""
        for j in range(i, len(line)):
            acc += _norm(line[j]["inferText"])
            if acc == label:
                return i, j
            if not label.startswith(acc):
                break
    return None


def _label_starts_at(line: list[dict], idx: int) -> bool:
    """idx 위치에서 어떤 라벨이 시작되는지 — 값 수집을 어디서 멈출지 판단용.
    이게 있어야 비어 있는 칸(전화번호 등)에 다음 라벨 글자가 값으로 들어가지 않는다."""
    for lb in LABELS:
        span = _find_label(line, lb, idx)
        if span and span[0] == idx:
            return True
    return False


def _value_right_of(line: list[dict], label: str) -> str | None:
    """한 줄에서 label 셀 오른쪽 토큰들을 다음 라벨이 시작되기 전까지 합쳐 반환.
    라벨 바로 뒤에 또 다른 라벨이 오면(= 칸이 비어 있음) None."""
    span = _find_label(line, label)
    if not span:
        return None
    parts: list[str] = []
    k = span[1] + 1
    while k < len(line):
        if _label_starts_at(line, k):
            break
        parts.append(line[k]["inferText"])
        k += 1
    return " ".join(parts).strip() or None


def _header_columns(header: list[dict], labels: list[str]) -> list[float] | None:
    """헤더 줄에서 labels를 왼쪽부터 순서대로 찾아 각 라벨 셀의 중심 x를 반환.
    같은 라벨이 반복되는 표(상품명/수량이 두 벌)를 위해 앞에서 찾은 구간 뒤부터 이어서 찾는다."""
    centers: list[float] = []
    cursor = 0
    for lb in labels:
        span = _find_label(header, lb, cursor)
        if not span:
            return None
        i, j = span
        centers.append(sum(_center(header[k])[0] for k in range(i, j + 1)) / (j - i + 1))
        cursor = j + 1
    return centers


def _split_by_columns(line: list[dict], centers: list[float]) -> list[str]:
    """줄의 토큰을 컬럼 중심 사이의 중간값을 경계로 나눠 칸별 문자열로 반환."""
    bounds = [(centers[i] + centers[i + 1]) / 2 for i in range(len(centers) - 1)]
    cells: list[list[str]] = [[] for _ in centers]
    for f in _drop_vertical_labels(line):
        x = _center(f)[0]
        col = len(bounds)
        for i, b in enumerate(bounds):
            if x < b:
                col = i
                break
        cells[col].append(f["inferText"])
    return [" ".join(c).strip() for c in cells]


def _parse_items(lines: list[list[dict]]) -> tuple[list[dict], str | None]:
    """상품 표 파싱. 헤더는 '상품명 수량 상품명 수량 비고'(좌우 두 벌)이고 값은 헤더 아래 줄들에
    들어 있다. 반환: (품목 리스트, 비고 전체 텍스트)."""
    header_idx = None
    centers = None
    for i, line in enumerate(lines):
        c = _header_columns(line, ["상품명", "수량", "상품명", "수량", "비고"])
        if c:
            header_idx, centers = i, c
            break
    if centers is None:
        return [], None

    # 다음 표(판매금액/기타 헤더)를 만나면 상품 표 끝
    end = len(lines)
    for i in range(header_idx + 1, len(lines)):
        if _find_label(lines[i], "판매금액") or _find_label(lines[i], "기타"):
            end = i
            break

    items: list[dict] = []
    notes: list[str] = []
    for line in lines[header_idx + 1: end]:
        cells = _split_by_columns(line, centers)
        if cells[4]:
            notes.append(cells[4])
        for name, qty in ((cells[0], cells[1]), (cells[2], cells[3])):
            if name:
                items.append({"name": name, "qty": qty or None})
    note = " ".join(notes).strip() or None
    # 비고는 표 전체에 걸친 병합 셀이라 첫 품목에 붙여 준다(계약서의 'Detector 1D는 Used' 같은 단서).
    if note and items:
        items[0]["note"] = note
    return items, note


def parse_contract(fields: list[dict]) -> dict:
    """OCR fields → 계약 폼 프리필 dict. 못 찾은 값(= 빈 칸)은 아예 넣지 않는다."""
    raw_lines = _lines(fields)
    lines = [_drop_vertical_labels(line) for line in raw_lines]
    lines = [line for line in lines if line]
    all_text = "\n".join(_text(line) for line in lines)
    flat = " ".join(_text(line) for line in lines)
    result: dict = {}

    # ── 매수자 정보: 라벨 오른쪽 값 ──
    for label, key in [("병원명", "buyer_hospital"), ("사업자등록번호", "buyer_biz_no"),
                       ("대표자명", "buyer_rep"), ("주소", "buyer_address"),
                       ("전화번호", "buyer_phone"), ("휴대폰", "buyer_mobile"),
                       ("팩스", "buyer_fax"), ("고객요구사항", "customer_request"),
                       ("예금주", "account_holder")]:
        for line in lines:
            v = _value_right_of(line, label)
            if v:
                result[key] = v
                break

    # 사업자등록번호는 패턴이 확실하므로 라벨 파싱이 빗나가도 보정
    m = re.search(r"\d{3}-\d{2}-\d{5}", flat)
    if m:
        result["buyer_biz_no"] = m.group(0)

    # 고객지불계좌 — "(농협) 408 - 17 - 003542"처럼 토큰이 쪼개져 오므로 공백을 정리한다
    for line in lines:
        v = _value_right_of(line, "고객지불계좌")
        if v:
            result["payment_account"] = re.sub(r"\s*-\s*", "-", v).strip()
            break

    # ── 날짜 ──
    for line in lines:
        joined = _norm(_text(line))
        if "계약일자" in joined and "contract_date" not in result:
            d = _to_date(_text(line))
            if d:
                result["contract_date"] = d
        if "설치희망일" in joined and "install_date" not in result:
            # 라벨 오른쪽 값만 보고 날짜를 뽑는다 — 같은 줄의 고객요구사항 칸 숫자에 끌려가지 않도록.
            v = _value_right_of(line, "설치희망일") or _text(line)
            d = _to_date(v)
            if d:
                result["install_date"] = d

    # ── 판매금액 / 기타: 헤더 아래 줄에서 컬럼별로 ──
    for i, line in enumerate(lines):
        centers = _header_columns(line, ["판매금액", "기타"])
        if not centers or i + 1 >= len(lines):
            continue
        amount_cell, etc_cell = _split_by_columns(lines[i + 1], centers)
        nums = [int(x.replace(",", "")) for x in re.findall(r"\d{1,3}(?:,\d{3})+", amount_cell)]
        if nums:
            result["sale_amount"] = max(nums)
            if "VAT" in amount_cell.upper() or "부가세" in amount_cell:
                result["sale_amount_note"] = "VAT 포함"
        if etc_cell:
            result["etc_note"] = etc_cell
        break
    else:
        # 표 헤더를 못 찾은 경우의 백업 — 문서 전체에서 가장 큰 금액
        amounts = [int(x.replace(",", "")) for x in re.findall(r"\d{1,3}(?:,\d{3})+", flat)]
        if amounts:
            result["sale_amount"] = max(amounts)
            if "VAT" in flat.upper() or "부가세" in flat:
                result["sale_amount_note"] = "VAT 포함"

    # ── 상품 표 ──
    items, _note = _parse_items(lines)
    if items:
        result["items"] = items

    return {"parsed": result, "raw_text": all_text}
