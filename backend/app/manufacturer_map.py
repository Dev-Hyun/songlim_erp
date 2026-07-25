"""
의료장비 모델명 → 제조사 매핑 + 시리즈 정규화

레거시 songlim_map/backend에서 그대로 이식(2026-07-25) — X-ray 통계의 "시리즈별" 집계
(model_series)에 사용. SONGLIM_ERP로 데이터 이전 시 model_series 컬럼 자체가 빠졌던 것을
복구하는 작업의 일부. detect_manufacturer는 참고용으로 함께 가져왔으나 현재 SONGLIM_ERP의
Equipment.manufacturer 값 자체를 재계산하는 데는 쓰지 않는다(기존 데이터 그대로 유지).

규칙:
- 각 키워드는 정규표현식으로 처리 (case-insensitive)
- 모호한 짧은 키워드는 단어 경계(\b) 사용
- 매칭 순서: 위에서 아래로, 먼저 매칭되는 제조사 채택
  → 더 구체적/유니크한 제조사(GE LOGIQ 등)를 위에 둠
"""
import re


# ─────────────────────────────────────────────────────────────
# 제조사별 매칭 패턴 (정규식)
# ─────────────────────────────────────────────────────────────
MAKER_RULES = [
    # ═══════════ 초음파 (Ultrasound) ═══════════

    # GE Healthcare — LOGIQ prefix가 Samsung V숫자보다 먼저 매칭되어야 함
    ("GE Healthcare", [
        r"\bLOGIQ",                  # LOGIQ + 무엇이든 (LOGIQ5, LOGIQ200MD 등 포함)
        r"\bVIVID",                  # VIVID + 무엇이든 (Vivid3 등 포함)
        r"\bVOLUSON",                # VOLUSON + 무엇이든 (VOLUSON730 등 포함)
        r"\bVERSANA",
        r"\bVENUE\b",
        r"\bVSCAN\b",
        r"INVENIA\s+ABUS",
        r"GE\s+HEALTHCARE", r"GE\s+MEDICAL",
        # X-ray
        r"\bDISCOVERY\s+XR",          # Discovery XR656, XR650
        r"\bDEFINI[NU]M\b",           # Definium 6000, 8000 (Definum 오기 포함)
        r"\bOPTIMA\s+XR",             # Optima XR220amx
        r"\bAMX[-\s]?\d",             # AMX-4+, AMX 4 Plus
        r"AMX\s+4\s+Plus",
        r"\bBRIVO\b",                 # Brivo XR575, Brivo XR285amx
        r"\bOEC\b",                   # OEC 9900 Elite (C-arm)
        r"GE\s+DEFINIUM",
        r"\bRT-?(MAX|2600|4600)\b",   # RT 시리즈 (구 GE Vingmed)
    ]),

    # Samsung Medison
    ("Samsung Medison", [
        r"\bHERA\b", r"\bUGEO\b",
        r"\bRS\s?80\w*", r"\bRS\s?85\w*", r"\bRS\s?90\w*",
        r"\bHS\s?[3-7]0\w*",         # HS30, HS40, HS50, HS60, HS70, HS70A 등
        r"\bWS\s?80\w*", r"\bWS\s?85\w*",
        r"\bACCUVIX\b", r"\bSONOACE\b",
        r"\bSA[\s-]?\d{3,4}\w*",     # SA-600, SA8000, SA-8800, SA-4800HD 등
        r"SAMSUNG\s*MEDISON", r"\bMEDISON\b",
        r"\bMYSONO\d*\b",
        r"\bHM70\w*\b",              # HM70, HM70A, HM70 EVO
        r"\bMINISONO\b",
        r"\bH60\b",                  # Samsung H60
        r"\bA-?35\b",                # Samsung Medison A35
        # V시리즈 단독 (V1~V29) — Samsung V-series
        r"^V[1-9]\b", r"^V1\d\b", r"^V2\d\b",
    ]),

    # Alpinion
    ("Alpinion", [
        r"E[-\s]*CUBE",               # E-CUBE, E- CUBE, ECUBE 모두 허용
        r"X[-\s]*CUBE",
        r"\bALPINION\b",
        r"\bEKO\s+\d",                # EKO 7
        r"\bALBIT\b",
        r"530\s*Compact",             # E-CUBE 530 Compact
        r"\bS-?[12]\d\b",             # S10, S12, S20, S22 (Alpinion S-series)
    ]),

    # Canon Medical (구 Toshiba)
    ("Canon Medical", [
        r"\bAPLIO\b",
        r"\bTUS-A\d", r"\bTUS-\w",
        r"\bXARIO\b", r"\bNEMIO\b", r"\bVIAMO\b",
        r"\bTOSHIBA\b",
        r"CANON\s+MED",
        r"\bSONIMAGE\b",
        r"\bSSA-660A\b", r"\bSSA-340A\b",
    ]),

    # Philips
    ("Philips", [
        r"\bEPIQ\b", r"\bAFFINITI\b",
        r"\bCLEARVUE",                # ClearVue, ClearVue350/550 등
        r"\bSPARQ\b", r"\bLUMIFY\b",
        r"\bIU\s?22\b", r"\bIU\s?33\b", r"\bIE\s?33\b",
        r"\bCX\s?(30|50)\b",          # CX30, CX50
        r"\bHD\s?(3|7|9|11|15)\b",    # HD3, HD11XE 등
        r"\bHD11XE\b",
        r"HDI[\s®-]?5000", r"\bHDI\b",
        r"\bENVISOR\b", r"\bM2424A\b", r"\bM2540A\b", r"\bM2410B\b",
        r"DIGITAL\s*DIAGNOST",        # DigitalDiagnost
        r"MobileDiagnost",            # MobileDiagnost wDR
        r"BUCKY\s*DIAGNOST",          # Bucky Diagnost TH
        r"\bELEVA\b",
        r"\bPHILIPS\b",
        r"\b128XP\b",                 # Philips 128XP
        r"\bSONOS\s*\d",              # Sonos 시리즈 (구 ATL)
    ]),

    # Siemens Healthineers
    ("Siemens Healthineers", [
        r"\bACUSON\b", r"\bSEQUOIA\b", r"\bJUNIPER\b", r"\bFREESTYLE\b", r"\bANTARES\b",
        r"\bSONOLINE\b",
        r"\bMULTIX\b", r"\bMOBILETT\b", r"\bYSIO\b", r"\bAXIOM\b", r"\bSIEMENS\b",
        r"\bPOLYMOBIL\b",
    ]),

    # Mindray
    ("Mindray", [
        r"\bRESONA\b", r"\bMINDRAY\b", r"\bNUEWA\b", r"\bCONSONA\b",
        r"\bDC-\d+\w*(\s+(Exp|Pro))?",# DC-3, DC-60, DC-70, DC-80A, DC-60 Exp 등
        r"\bDC-(N\d|T\d)",
        r"\bZ\.?ONE\b", r"ZONE\s+ULTRASOUND",
        r"\bTE[57]\b",
    ]),

    # Hitachi / Fujifilm Healthcare
    ("Fujifilm/Hitachi", [
        r"\bARIETTA\b", r"\bLISENDO\b", r"\bNOBLUS\b", r"\bASCENDUS\b", r"\bPREIRUS\b",
        r"HI\s+VISION", r"\bHIVISION\b", r"\bHITACHI\b",
        r"\bPROSOUND\b",
        r"\bSSD-\d",
        r"\bALOKA\b",
        r"\bEUB-\d",                  # Hitachi EUB 시리즈
        r"\bF(31|37|75)\b",
        r"\bORIX\b",
        # X-ray (Fujifilm/Hitachi)
        r"SIRIUS\s+STARMOBILE",       # Sirius Starmobile tiara (모바일 X-ray)
        r"Srius\s+Starmobile",        # 오기 변형
        r"\bSIRIUS[-\s]\d",           # Sirius 130HP, SIRIUS-130HP, SIRIUS-125D
        r"\bSIRIUS-\d",               # SIRIUS-130HP 직접 매칭
        r"\bRADNEXT\d*",              # Radnext 80
        r"\bD-EVO\b",                 # D-evo FIT (Fujifilm DR)
    ]),

    # SonoSite (Fujifilm 산하)
    ("SonoSite", [
        r"\bSONOSITE\b",
        r"M-TURBO", r"M-TURBOTM",
        r"\b180PLUS\b", r"S-NERVE",
        r"\bMICROMAXX\b", r"X-PORTE", r"\bNANOMAXX\b",
        r"\bIVIZ\b",                  # iViz Ultrasound
        # SonoSite EDGE/TITAN (Ultrasound) — TITAN2000은 X-ray라 별도 처리
        r"SONOSITE\s+(EDGE|TITAN|S2|S-NERVE)",
        r"\bEDGE\s+II\b",
    ]),

    # BK Medical
    ("BK Medical", [
        r"\bTYPE\s+(11\d{2}|12\d{2}|13\d{2}|21\d{2}|22\d{2}|23\d{2}|24\d{2})\b",
        r"BK[\s-]?MEDICAL",
        r"PRO\s*FOCUS", r"FLEX\s*FOCUS",
        # Ultrasonix (BK Medical 인수)
        r"\bSONIX\s+(TOUCH|OP|RP)\b",
    ]),

    # Olympus
    ("Olympus", [
        r"\bOLYMPUS\b", r"\bEU-ME[12]\b",
    ]),

    # SuperSonic Imagine
    ("SuperSonic Imagine", [
        r"\bAIXPLORER\b",
    ]),

    # Esaote
    ("Esaote", [
        r"\bMYLAB",                   # MyLab, MyLab25 Gold, MyLabSeven 등
        r"\bESAOTE\b", r"\bLAXIS\b", r"\bMIRRUS\b",
    ]),

    # Boston Scientific (IVUS)
    ("Boston Scientific", [
        r"ILAB",                       # iLab가 모델명 중간에 들어가는 경우 포함
        r"VOLCANO\s+S5", r"VOLCANO\s+CORE", r"\bVOLCANO\b",
    ]),

    # Healcerion
    ("Healcerion", [
        r"\bSONON\s?\d", r"\bSONON\b",
    ]),

    # Terason
    ("Terason", [
        r"\bTERASON\b",
    ]),

    # Echosens (FibroScan 간섬유화)
    ("Echosens", [
        r"\bFIBRO\s?SCAN\b",
    ]),

    # Terason
    ("Terason", [
        r"\bTERASON\b", r"\bT3[02]00\b",
    ]),

    # DWL (Doppler-Box)
    ("DWL", [
        r"\bDOPPLER-BOX",
    ]),

    # eZono
    ("eZono", [
        r"\bEZONO\b",
    ]),

    # Telemed (LogicScan)
    ("Telemed", [
        r"\bLOGICSCAN\b",
    ]),

    # InVision
    ("InVision", [
        r"IN-VISION\s+GOLD", r"INVISION\s+GOLD",
    ]),

    # Chison Medical (중국)
    ("Chison", [
        r"\bCUS-[A-Z]",               # CUS-AA000, CUS-AME00
    ]),

    # Innosight (한국 초음파)
    ("Innosight (한국)", [
        r"\bINNOSIGHT\b",
    ]),

    # KIES Medical (한국)
    ("KIES Medical", [
        r"\bKEC-\d",                  # KEC-500, KEC-650 등
    ]),

    # SuperSonic Imagine (다시 선언 — 위에 있지만 안전상)
    # ↑ 위에서 이미 처리됨

    # ═══════════ X-ray ═══════════

    # DRGEM (디알젬)
    ("DRGEM", [
        r"\bGXR\b", r"\bGXR-", r"\bGXRD",
        r"\bREDIKOM\b",
        r"\bDRGEM\b",
        r"\bREMEX-",                  # REMEX-KA6 등
        r"\bJADE-?\d",                # JADE-40
        r"\bRADMAX\b",
        r"\bTOPAZ-\d",
    ]),

    # LISTEM (리스템)
    ("LISTEM", [
        r"\bLISTEM\b",
        r"\bREX[-\s]\d", r"\bREX-",
        r"\bDXG\d",                   # DXG525R-RS, DXG325R 등 (숫자로 이어지는 변형)
        r"\bDXG[H\s-]", r"^DXG\b",
        r"\bDXGH\d",                  # DXGH525-R-RS 등
        r"\bDXGHA?\b",
        r"\bHRX-",
        r"\bMDXP",
        r"\bACEMOBIL\w*",
        r"\bMOBIRAD\b", r"\bMOBIX-?\d?",
        r"\bMXHF",
        r"\bMXD[\s-]",                # MXD 325R-R-FSB, MXD-
        r"\bMXD\d",                   # MXD325R 등
        r"\bHD-(100|300|500)R-AD",    # HD-300R-AD, HD-500R-AD, HD-100R-AD
        r"\bHD-[135]\d{3}",           # HD-5125, HD-5150 등
        r"\bR\s?-?(100|300|500)-(100|125)",  # R 100-100, R-300-100/ASA, R-500-125
        r"\bASA[-\s]?\d",             # ASA-325R 등
        r"\bRU\s?510\b",              # RU510
        r"\bLX[-\s]?(7|32|40)\b",     # LX 7, LX 32, LX-7, LX 40
        r"\bTITAN\s?2000",            # TITAN2000, TITAN 2000M
        r"\bTITAN\s?1000",            # TITAN 1000
        r"\bASG-",                    # ASG-325R
        r"\bRF-\d{3}-\d{3}",          # RF-500-125, RF-300-125 등
        r"\bDY-\d{3}R",               # DY-525R, DY-325R 등
        r"\bDY-\d{3}A",               # DY-100A 등
        r"\bBRS-[EU]\b",              # BRS-E, BRS-U (LISTEM 초음파 시스템)
        r"\bEXON\s?\d",               # EXON 40 (LISTEM 계열 X-ray)
    ]),

    # DK메디칼시스템
    ("DK메디칼시스템", [
        r"\bACCURAY\b", r"\bACCUIMAGE\b",
        r"\bAccRay\b", r"\bAccRAY\b", r"\bACC-\d{3}",  # 표기 변형
        r"\bDK\s*[IⅡ]{2}[\s-]",       # DKⅡ-325R, DKⅡ -525R, DKII-525R
        r"\bDK\s*II\s*[-]",
        r"\bDK\s*Ⅱ\s*[-]",
        r"\bDK11-",                   # DK11-525R, DK11-325R (오기)
        r"\bDK2-",                    # DK2-525R, DK2-325R (오기)
        r"\bDKll-",                   # DKll-525R (소문자 l)
        r"\bDK-?(525|325|100)",
        r"DK\s*MEDICAL", r"DK메디칼",
        r"\bINNOVISION\b",
        r"\bDC-(525|325)R",           # DC-525R, DC-325R (Mindray와 다른 시리즈)
        r"\bC-?\d{3}-(AD|R)\b",       # C-100-R, C-300-AD, C-500-R 등
        r"\bDHF-\d",                  # DHF-155HⅡ
        r"\bDM-\d",                   # DM-105N
    ]),

    # SG Healthcare (에스지헬스케어)
    ("SG Healthcare", [
        r"\bJUMONG\b", r"\bGARION\b", r"\bDOMINUS\b",
        r"SG\s+HEALTHCARE",
    ]),

    # Medonica (메도니카)
    ("Medonica", [
        r"\bRFM-\d", r"\bRFM\s",
        r"\bMEDONICA\b",
    ]),

    # ECORAY (에코레이)
    ("ECORAY", [
        r"ECO\s*SMART", r"\bECORAD\b", r"ECO\s+RAD", r"\bECORAY\b",
        r"\bSIG-\d",                  # SIG-40-525, SIG-30-325 등 (ECORAY HF-525 Plus 계열)
        r"\bEVA[\s-]?HF",
        r"\bCOMED\b",
        r"\bHF-550",                  # HF-550Plus
        r"\bAPOLLON\b",               # Apollon (Ecoray)
        r"\bOMNIRAD\b",
    ]),

    # AJEX
    ("AJEX", [
        r"\bAJEX",
    ]),

    # Samsung Electronics / Samsung Medison (의료영상 - X-ray)
    ("Samsung Medison", [
        r"\bXGEO\b",                  # XGEO 브랜드 전체
        r"\bGC[678]\d\w*\b",          # GC60, GC70, GC75, GC80, GC85A 등
        r"\bGM[5-9]\d\w*\b",          # GM50, GM60A, GM85 등
        r"\bGU\d{2}\w*\b",            # GU60A, GU60 등
        r"\bGF\d{2}\w*\b",            # GF50, GF85 등
        r"\bAccE\s+GM",               # AccE GM85 변형
    ]),

    # 메디엔텍 (Medientech) — Galaxy + ELMO 시리즈
    ("메디엔", [
        r"\bGALAXY\s+(Lite|Plus|\d+[PC]?)\b", # Galaxy Lite, Galaxy Plus, Galaxy 50C 등
        r"\bGALAXY\d{2,}\b",                   # Galaxy50, Galaxy80 등
        r"\bELMO[-\s]",                         # ELMO-MX8, ELMO-T3, ELMO-T6 등
        r"^ELMO\b",                             # 단독 시작
        r"\bELMO[A-Z]",                         # ELMO T6S, ELMO EFX 등
    ]),

    # EOS Imaging (프랑스 — 정형외과)
    ("EOS Imaging", [
        r"^EOS$", r"\bEOSEDGE\b",
    ]),

    # 디알텍 (DRTECH)
    ("디알텍", [
        r"\bDRTECH\b", r"DR[-\s]?TECH",
        r"\bEXSYS\b",
        r"\bFOREXIA\b",
        r"\bHANDY[-\s]?RAD",          # Handy-Rad, Handy-RadⅡ, Handy-Rad SE
    ]),

    # GEMSS Medical Systems (지엠에스메디칼, 구 COMED) — XVISION/DRS/IZI 계열
    ("GEMSS", [
        r"\bXVISION\b", r"\bXAYMED\b",
        r"\bDRS-[678]00\b",
        r"\bIZI\s",
    ]),

    # 동강의료기기
    ("동강의료기기", [
        r"\bUD150", r"\bDONGKANG\b",
    ]),

    # 포스콤 (Poscom)
    ("포스콤", [
        r"\bPOSCOM\b",
        r"\bNCG[-\s]?6?00",
        r"\bPOXM\b",
        r"\bPOX-\d",                  # POX-100BT
        r"\bPXP-\d",                  # PXP-40HF
    ]),

    # CSE
    ("CSE", [
        r"\bCST-21\w*",
        r"\bMU125",                   # MU125M, MU125P
    ]),

    # 보령메디언스
    ("보령메디언스", [
        r"\bDIGIRAD\b", r"DIGI\s*RAD",
        r"RAD[-\s]?MASTER", r"\bRADMASTER\b",
        r"\bPANAVISTA\b",
    ]),

    # GENORAY
    ("GENORAY", [
        r"\bGENORAY\b", r"\bPAPAYA\b", r"\bPORT-X\b",
    ]),

    # Carestream
    ("Carestream", [
        r"\bCARESTREAM\b",
        r"\bDRX[-\s]",
    ]),

    # Shimadzu
    ("Shimadzu", [
        r"\bRAD\s?SPEED\b", r"\bSHIMADZU\b",
        r"\bMOBILE\s?ART\b", r"\bMOBILE\s?DART\b",
        r"\bMUX-",
        r"\bMX-\d{2,3}\b",            # MX-50, MX-50C (Shimadzu MX 시리즈)
    ]),

    # Konica Minolta
    ("Konica Minolta", [
        r"\bAERODR\b", r"\bKONICA\b",
    ]),

    # Canon X-ray
    ("Canon X-ray", [
        r"\bCXDI\b", r"\bCXD-",
        r"\bKXO-",
    ]),

    # Agfa
    ("Agfa", [
        r"\bAGFA\b", r"\bDX-D\b",
    ]),

    # Fujifilm X-ray
    ("Fujifilm", [
        r"\bFDR\s", r"\bCALNEO\b",
    ]),

    # Vatech
    ("Vatech", [
        r"\bVATECH\b", r"\bPAXSCAN\b",
    ]),

    # Vieworks
    ("Vieworks", [
        r"\bVIEWORKS\b", r"\bVXVUE\b",
    ]),

    # Wise
    ("Wise (한국)", [
        r"WISE[-\s]?DR",
    ]),

    # Mineray
    ("Mineray", [
        r"\bMINE[\s-]?2", r"\bMINERAY\b",
    ]),

    # 나눔테크 / 오스템
    ("나눔테크", [r"나눔"]),
    ("오스템",   [r"\bOSSTEM\b"]),
]

# 정규식 컴파일 (캐시)
_COMPILED = []
for maker, pats in MAKER_RULES:
    compiled = [re.compile(p, re.I) for p in pats]
    _COMPILED.append((maker, compiled))


def detect_manufacturer(model: str) -> str:
    if not model:
        return "미상"
    s = str(model).strip()
    if not s or s in ("nan", "-", "–", "표시무", "미확인"):
        return "미상"
    for maker, pats in _COMPILED:
        for p in pats:
            if p.search(s):
                return maker
    return "기타"


# ─────────────────────────────────────────────────────────────
# 모델 시리즈 정규화 — X-ray 전용 (초음파는 원본 모델명 유지)
# 예: "GXR-40SD", "GXR-C40SD", "GXR-U40SD" → "GXR-40 시리즈"
# ─────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────
# 테스트
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    tests = [
        ("LOGIQ P6 Pro",           "GE Healthcare"),
        ("LOGIQ V5",               "GE Healthcare"),
        ("LOGIQ V5 Expert",        "GE Healthcare"),
        ("LOGIQ V2",               "GE Healthcare"),
        ("V8",                     "Samsung Medison"),     # 핵심 — V시리즈 인식
        ("V7",                     "Samsung Medison"),
        ("V6",                     "Samsung Medison"),
        ("V5",                     "Samsung Medison"),
        ("ACCUVIX V10",            "Samsung Medison"),
        ("ACCUVIX V20",            "Samsung Medison"),
        ("RS80",                   "Samsung Medison"),
        ("HS40",                   "Samsung Medison"),
        ("HS70A",                  "Samsung Medison"),
        ("MySono U6",              "Samsung Medison"),
        ("SA-4800HD",              "Samsung Medison"),
        ("iU22 Ultrasound System", "Philips"),
        ("Affiniti 50",            "Philips"),
        ("Affiniti 50G",           "Philips"),
        ("E-CUBE 12",              "Alpinion"),
        ("X-CUBE 90",              "Alpinion"),
        ("EKO 7",                  "Alpinion"),

        # 핵심 수정 확인
        ("JUMONG GENERAL",         "SG Healthcare"),
        ("JUMONG GENERAL PRO",     "SG Healthcare"),
        ("INNOVISION-DX",          "DK메디칼시스템"),
        ("INNOVISION-EXII",        "DK메디칼시스템"),
        ("DXG-525R",               "LISTEM"),
        ("DXGH525-R-RS",           "LISTEM"),
        ("RFM-525HF",              "Medonica"),
        ("AJEX140H",               "AJEX"),
        ("AJEX2000H",              "AJEX"),
        ("ECO smart",              "ECORAY"),
        ("EVA-HF525",              "ECORAY"),
        ("EcoRAD",                 "ECORAY"),
        ("GXR-40SD",               "DRGEM"),
        ("GXR-C40SD",              "DRGEM"),
        ("AccuRay D6",             "DK메디칼시스템"),
        ("XVISION-525",            "GEMSS"),
        ("CST-21HF",               "CSE"),
        ("Type 2202",              "BK Medical"),
        ("SONIMAGE HS1",           "Canon Medical"),
        ("Aixplorer",              "SuperSonic Imagine"),
    ]
    print("=== 제조사 매칭 ===")
    ok = err = 0
    for m, expected in tests:
        got = detect_manufacturer(m)
        if got == expected:
            ok += 1; mark = "✓"
        else:
            err += 1; mark = "✗"
        print(f"  {mark} {got:<22}  {m}" + (f"   (예상: {expected})" if got != expected else ""))
    print(f"\n  결과: {ok} 성공 / {err} 실패")

    print("\n=== 시리즈 통합 (X-ray만) ===")
    xr_samples = [
        "GXR-40SD", "GXR-C40SD", "GXR-U40SD", "GXR-52SD",
        "DXG-525R", "DXGH525-R-RS",
        "SIG-30-325", "SIG-40-525",
    ]
    for s in xr_samples:
        print(f"  [xr] {s:<25} → {model_series(s, 'xr')}")

    print("\n=== 초음파는 원본 유지 ===")
    us_samples = [
        "LOGIQ P5 Pro", "E-CUBE 12R", "RS80A", "ACCUVIX V10", "iU22",
    ]
    for s in us_samples:
        print(f"  [us] {s:<25} → {model_series(s, 'us')}")
