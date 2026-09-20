"""X-ray 모델명 → 시리즈 표시명 정규화.

예: "GXR-40SD", "GXR-C40SD", "GXR-U40SD" → "GXR-40 시리즈"
장비 통계에서 같은 기종의 표기 변형을 한 줄로 묶는 데만 쓴다(routers/sales_map.py).

**제조사 추정 규칙(detect_manufacturer / MAKER_RULES)은 2026-09-20에 제거했다.**
모델명 문자열로 제조사를 맞히는 방식이 데이터 교차검증 보고서에서 실제 오류로 확인됐기
때문이다 — 예: `SONIMAGE HS1`을 Canon으로 붙였으나 식약처 허가 `수인15-4130호`는
KONICA MINOLTA다. 제조사는 이제 **식약처 허가번호 대조로만** 붙인다
(scripts/assign_equipment_manufacturer.py). 시리즈 정규화는 제조사와 무관하므로 남긴다.
"""
import re


def _gxr(m): return f"GXR-{m.group(1)} 시리즈"
def _dxg(m): return f"DXG-{m.group(1)} 시리즈"
def _sig(m): return f"SIG-{m.group(1)} 시리즈"
def _elmo_t(m): return f"ELMO-T{m.group(1)} 시리즈"
def _acc(m): return f"AccuRay {m.group(1)} 시리즈"

# (regex, builder) — X-ray 시리즈만
SERIES_HANDLERS = [
    # DRGEM GXR — GXR-40S, GXR-C40SD, GXR-U40S, GXR-EC40S, GXR-E40S
    (re.compile(r"^\s*GXR[-\s]?[CUE]?C?(\d{2,3})", re.I), _gxr),
    # LISTEM DXG / DXGH — DXG-325R-RS, DXGH525-R-RS, DXG525R-RS
    (re.compile(r"^\s*DXG[-\s]?H?A?(\d{3,4})",  re.I), _dxg),
    # LISTEM SIG
    (re.compile(r"^\s*SIG-(\d{2})",             re.I), _sig),
    # 메디엔 ELMO T 시리즈 — ELMO-T3, ELMO-T3P, ELMO-T6S, ELMO-T3S
    (re.compile(r"^\s*ELMO[-\s]T(\d)",          re.I), _elmo_t),
    # ECORAY ECO smart 계열 (ECO smart, ECO SMART, EcoSmart 등)
    (re.compile(r"^\s*ECO\s+SMART",             re.I), lambda m: "ECO smart 시리즈"),
    # ECORAY EcoRAD 계열 (EcoRAD, ECORAD, EcoRAD-503T-CA 등)
    (re.compile(r"^\s*ECO\s*RAD",               re.I), lambda m: "EcoRAD 시리즈"),
    # ECORAY EVA-HF 계열
    (re.compile(r"^\s*EVA[-\s]?HF",             re.I), lambda m: "EVA-HF 시리즈"),
    # DK메디칼 AccuRay 계열 — AccuRay D5, AccuRay 525R, AccuRay 630R
    (re.compile(r"^\s*Acc(?:u|u)?Ray\s+(D?\d+R?)", re.I), _acc),
]


def model_series(model: str, category: str = None) -> str:
    """
    모델명 → 시리즈 표시명 (X-ray만 통합, 초음파는 원본 그대로)
    category: 'us' (초음파) or 'xr' (엑스레이) — 'us'면 통합 안 함
    """
    if not model:
        return None
    s = str(model).strip()
    if not s or s in ("nan", "-", "–"):
        return None
    # 초음파는 원본 모델명 그대로
    if category == "us":
        return s
    # X-ray만 시리즈 통합
    for pat, fn in SERIES_HANDLERS:
        if pat.match(s):
            return fn(pat.match(s))
    return s


