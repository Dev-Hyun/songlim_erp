"""제안서 장비 카탈로그 — 주요 장비의 표시 문구·사진·옵션.

문구 안의 `**…**`는 PDF에서 빨간 굵은 글씨(강조)로 바뀐다.
사진 경로는 `app/proposal/static/` 기준 상대 경로.
장비를 추가하려면 여기 항목과 사진만 넣으면 된다(같은 페이지 종류라면 템플릿 수정 불필요).
"""

XRAY_DETECTOR_TYPES = ["MANO 17x17", "LUMEN 17X17"]
XRAY_TABLE_TYPES = ["PBT-4", "PBT-6", "PBT-6 DELUXE"]

XRAY_MODELS: dict[str, dict] = {
    "GXR-E40S Plus": {"type": "stand", "sub": "Stand Type", "desc_line": "500mA / 125kV / 40kW, Stand Type", "img": "img/e40s.png"},
    "GXR-40SD": {"type": "ceiling", "sub": "Ceiling Type", "desc_line": "500mA / 125kV / 40kW, Ceiling Type, Tube: CSE", "img": "img/sd.png"},
    "GXR-52SD": {"type": "ceiling", "sub": "Ceiling Type", "desc_line": "640mA / 150kV / 52kW, Ceiling Type, Tube: CSE", "img": "img/sd.png"},
    "GXR-68SD": {"type": "ceiling", "sub": "Ceiling Type", "desc_line": "800mA / 150kV / 68kW, Ceiling Type, Tube: CSE", "img": "img/sd.png"},
    "GXR-82SD": {"type": "ceiling", "sub": "Ceiling Type", "desc_line": "1000mA / 150kV / 82kW, Ceiling Type, Tube: CSE", "img": "img/sd.png"},
}

# 체크한 옵션만 PDF 하단 OPTIONS에 금액과 함께 나간다(표시 순서 = 이 순서).
XRAY_OPTIONS: dict[str, str] = {
    "capacitor": "Capacitor",
    "table_6way": "6WAY TABLE 변경",
    "table_6way_deluxe": "6WAY DELUXE TABLE (하단 개방형) 변경",
    "ma640": "640mA(52SD) 변경",
    "ma800": "800mA(68SD) 변경",
    "ma1000": "1000mA(82SD) 변경",
    "detector_1d": "DETECTOR 1D 추가",
    "detector_lumen": "DETECTOR LUMEN 17X17 변경",
    "auto_sync": "AUTO SYNC 추가 (CSA-A)",
    "auto_stitching": "AUTO STICHING 추가 (CSA-AS)",
    "stitching_stand": "STICHING STAND 추가",
}


def xray_include(model: str, detector_count: int, detector_type: str | None, table: str | None) -> list[str]:
    """X-ray INCLUDE 문구 자동 작성 (New.md 지시 문구 그대로)."""
    if XRAY_MODELS[model]["type"] == "stand":
        return [
            "X-ray System",
            f"Detector **{detector_count}EA** (MANO 17 X 17)",
            "Stand Bucky & 4Way Table",
            "설치 및 장비 및 방어시설 검사비용 포함",
        ]
    return [
        "X-ray System (CEILING)",
        f"DETECTOR **{detector_count}EA** ({detector_type})",
        f"TABLE : {table}",
        "**설치 및 잔넬 공사비용 포함**",
        "장비 및 방어시설 검사비용 포함",
    ]


PACS = {
    "brand": "TECHHEIM", "model": "VIEWREX 3", "warranty": "3년", "desc": "**12 Copy**",
    "lead": [
        "ViewRex3 PACS는 설치형 의료영상 저장·전송 시스템 서비스입니다.",
        "다양한 의료장비의 영상을 빠르게 전송, 저장, 조회할 수 있는 PACS입니다.",
    ],
    "feats": [
        "고도의 기술력과 User(고객병원) 의견 반영",
        "**10개 국어 지원**: 글로벌 스탠다드 PACS Solution",
        "세련된 이미지 툴",
        "사용자 선호에 따라 수정, 확장",
        "사용자 친화적 인터페이스 제공",
        "Pre-loading과 Background loading 기술로 **빠른 영상 표시**",
        "Windows 64bit OS 지원",
        "다양한 사용자별 옵션 설정 기능",
    ],
    "imgs": ["img/viewrex1.png", "img/viewrex2.png", "img/viewrex3.png"],
}

MAMMO_MODELS: dict[str, dict] = {
    "AIDIA LUXE": {"brand": "DRTECH", "sub": "3D TOMO", "img": "img/luxe.png", "desc": [
        "**2D / 3D / 2D Synthetic** 영상 지원", "Multi-Angle 2가지 앵글로 환자별 맞춤 검사",
        "T-arm & C-arm 독립 2축 회전으로 진동 최소화", "Auto Positioning · 자동 저장 Full Automation"]},
    "AIDIA UD": {"brand": "DRTECH", "sub": "직접방식", "img": "img/udtdb.png", "desc": [
        "**a-Se 직접방식** 디텍터로 선명한 고해상도 영상", "**65㎛** 최소 픽셀 사이즈로 조기 진단율 향상",
        "Advanced AEC로 정밀한 선량 제어", "Generator 내장 컴팩트 디자인, 1-2-3 paddle"]},
    "AIDIA TD": {"brand": "DRTECH", "sub": "간접방식", "img": "img/udtdb.png", "desc": [
        "FOCUS CsI 간접방식 고품질 유방영상", "**76㎛** 최소 픽셀 사이즈로 조기 진단율 향상",
        "Advanced AEC · Switching Dual Filter", "내장 Generator로 저소음, 검진차량 설치 가능"]},
    "AIDIA TDB": {"brand": "DRTECH", "sub": "간접방식", "img": "img/udtdb.png", "desc": [
        "24×30 Screening", "Small & Implant (유상)", "Spot (유상)",
        "Magnification Set (확대촬영 세트)", "Localization Set (조직검사 세트) (유상)"]},
    "AIDIA VOLVE": {"brand": "DRTECH", "sub": "간접방식", "img": "img/volve.png", "desc": [
        "합리적인 가격의 **고사양 맘모장비**", "**76㎛** 작은 픽셀 사이즈의 고해상도 영상",
        "PC·제너레이터 내장으로 최적화된 공간 효율", "C-arm 자동 회전 & Lift, 원터치 Push & Play"]},
    "PINKVIEW BT": {"brand": "BEMEMS", "sub": "+ DRTECH RSM1824C", "img": "img/pinkview.png",
        "include": ["DRTECH DETECTOR [RSM 1824C]"],
        "desc": ["**100mA@25kV**의 동급 우수 출력", "마이콤을 이용한 편리한 디지털 압박력 제어",
                 "높은 선예도를 위한 **SID 660mm** 적용", "서브 조작부에 압박력·압박 두께 표시"],
        "det": {"name": "RSM 1824C", "img": "img/rsm1824c.png",
                "feats": ["**76㎛** 작은 픽셀의 고해상도 고품질 영상", "기존 장비 · AEC Sensor 완벽 호환, 간편한 업그레이드",
                          "필름 CR IP 카세트와 동일 사이즈", "세계 40여 개국에서 사용되는 검증된 제품"],
                "spec": "CsI 직접증착 · 2,304 × 3,072 · 194.5 × 267.5 × 14.2mm · 0.92kg"}},
}

CARM_INCLUDE = ["Main Body, 방호판 및 납복", "C-arm 장비 검사 및 방어시설 검사", "**전동테이블 포함**"]
CARM_WARRANTY = "3년 (단, TUBE · I.I. · Detector는 2년)"
CARM_NOTE = {"title": "송림메디칼 차별화 서비스", "text": "**C-arm 대체 장비**를 운영하고 있어 문제 발생 시 **즉각 대응**이 가능합니다."}

CARM_MODELS: dict[str, dict] = {
    "ZEN-2090 TURBO": {"sub": "9 Inch I.I. (CCD)", "img": "img/zen2090.png", "desc": [
        "**9인치 I.I.** (9 / 6 / 4.5인치 3단 시야)", "고출력 HLF 투시 모드 (2.0kW)",
        "Low Dose · Pulse 모드 · Laser Aimer", "Free Space 740mm · 120° 회전"]},
    "OSCAR PRIME": {"sub": "Plate Panel 26×26", "img": "img/oscarprime.png", "desc": [
        "**5.3kW** 발생기 + 쿨링 모듈 탑재", "26×26cm 평판 디텍터(FPD)",
        '10.4" 터치스크린 · DSA 기능', "Low Dose · Auto / Virtual Collimation"]},
    "OSCAR 15": {"sub": "Plate Panel 26×26", "img": "img/oscar15.png", "desc": [
        "**15kW** 고출력 발생기 (회전양극관)", "26×26cm 평판 디텍터(FPD)",
        '10.4" 터치스크린 · DSA 기능', "Low Dose · Auto / Virtual Collimation"]},
    "OSCAR 15FD": {"sub": "TFT FPD 30×30", "img": "img/oscar15fd.png", "desc": [
        "**15kW** 고출력 발생기 (회전양극관)", "**30×30cm TFT** 평판 디텍터",
        "**43인치 모니터** · DSA 기능", "모션 · 금속 보정, 선량 정보 표시"]},
    "BELLIGER ACE": {"sub": "Plate Panel · 모니터 일체형", "img": "img/belliger.png", "desc": [
        "3.2kW 발생기 · **모니터 일체형**", "20×20 CMOS / 21×21 TFT FPD",
        '27" 4K UHD / FHD 모니터 (선택)', "시술 공간 860mm · 3단 선량 모드"]},
}

CARM_TABLES: dict[str, dict] = {
    "HCK": {"kind": "hck", "brand": "HCK", "model": "C301", "name": "전동 1단 C-ARM 테이블", "warranty": "1년",
            "spec": [["규격", "W600 × D2000 × H600 ~ 1000 (mm)"], ["무게", "100 KG"], ["POWER", "220V / 60Hz"],
                     ["SWITCH", "1CH HAND"], ["작동", "UP, DOWN 기능"]],
            "img": "img/c301.png", "draw": "img/c301_draw.png"},
    "01M": {"kind": "x3c", "brand": "01M", "model": "X3-C", "name": "C-arm Table 2 Motion", "warranty": "1년",
            "tagline": "베이클라이트 소재를 통한 Frame-less C-arm 테이블",
            "feats": [["Frame-less", "프레임 없는 베이클라이트 상판으로 영상 시야 방해 없이 Oblique·Arthrogram 촬영"],
                      ["High Quality Image", "투과율 높은 상판으로 선명한 촬영, 쿠션감 있는 분리형 상판"],
                      ["Premium Specifications", "덴마크 LINAK 모터 적용, 저소음 · 높은 내구성"],
                      ["Low Position", "3단 리낙컬럼으로 최저 높이 650mm, 고령 환자도 쉽게 승하차"],
                      ["Elevation · Tilting", "높이 조절과 틸팅으로 다양한 진료 자세 지원"],
                      ["Automatic alignment", "핸드 리모컨 자동 수평 맞춤으로 빠른 복귀"]],
            "size": "W600 × L2,000 × H650 ~ 950 mm", "weight": "90kg / 안전하중 135kg",
            "img": "img/x3c_main.png",
            "tiles": [["img/x3c_column.jpg", "LINAK 3단 컬럼"], ["img/x3c_low.jpg", "최저 650mm Low Position"],
                      ["img/x3c_shield.jpg", "Radiation Shield (Option)"]]},
}

SELD = {
    "brand": "CARESON", "model": "SELD X70", "warranty": "3 YEAR",
    "feats": ["C-arm 튜브 끝에 장착하는 방사선 저감 필터", "선량 **최대 87% 저감** (제조사 측정)",
              "진료 영상 화질 손실 없이 필터링", "C-arm 모델별 튜브 맞춤 정밀 가공"],
    "img": "img/seld_main.jpg",
    "tiles": [["img/seld_mount.jpg", "C-arm 튜브에 밀착 장착"], ["img/seld_graph.jpg", "장착 전·후 선량 비교 (제조사 측정)"]],
}

BMD_MODELS: dict[str, dict] = {
    "DEXXUM T": {"sub": "Pencil Beam DXA", "img": "img/dexxum_t.png",
        "size": "W1850 / 1900 / 2000 × D800 × H1213 mm · 테이블 높이 652 mm", "desc": [
        "**펜슬빔** 중앙형 DXA 골밀도 측정기", "요추 · 양측 대퇴골 · 전완 측정",
        "요추 + 양측 대퇴 원버튼 동시 측정, Auto-ROI", "컴팩트 폴딩 테이블, 환자 침대 겸용"]},
    "DEXXUM T QUANTUM": {"sub": "Fan Beam DXA", "img": "img/dexxum_q.png",
        "size": "W1850 / 1900 / 2000 × D800 × H1213 mm · 테이블 높이 652 mm · 145 kg", "desc": [
        "**4채널 디텍터 팬빔** 중앙형 DXA 골밀도 측정기", "요추 · 양측 대퇴골 · 전완 측정",
        "요추 + 양측 대퇴 원버튼 동시 측정, Auto-ROI", "컴팩트 폴딩 테이블, 환자 침대 겸용"]},
    "PRIMUS": {"sub": "Whole Body DXA", "img": "img/primus.png",
        "size": "Short Body W2284 × D1045 × H1258 mm · 210 kg · 110 / 220VAC", "desc": [
        "**16채널** 협폭 팬빔 **전신(Whole body)** DXA", "요추 · 대퇴골 · 전완 · 측면척추 · VFA · 전신 측정",
        "요추 **30초** · 대퇴골 **25초**, 전신 7분", "전신 체성분 측정으로 골다공증 · 근감소증 동시 평가"]},
}

US_BRANDS: dict[str, dict] = {
    "DRGEM": {"models": {
        "DS20": {"img": "img/ds20.png", "desc": ["외래·검사실용 컴팩트 초음파", "15인치 모니터, 소형 설계로 이동 용이",
                 "μ-Scan 노이즈 저감 · M-Tuning 원터치 최적화", "복부·심장·갑상선·혈관·유방·근골격"]},
        "DS30": {"img": "img/ds30.png", "desc": ["디알젬 **프리미엄** 초음파 (DS20 상위)", '21.5" LED 모니터 + 13.3" 틸팅 터치',
                 "μ-Scan · SR Flow(저속혈류) · 컬러 파노라마", "산부인과(S-Fetus AI · Auto NT) · 복부 · 심장"]}}},
    "SAMSUNG MEDISON": {"models": {
        "V5": {"img": "img/v5.png", "desc": ["슬림·컴팩트 범용 모델, 배터리 옵션", '21.5" 모니터 + 14" 터치',
               "S-Vue 프로브 · HQ-Vision", "복부·갑상선·심장·근골격"]},
        "V6": {"img": "img/v6.png", "desc": ["중급형, Crystal Architecture 영상엔진", '21.5" 모니터 + 14" 터치',
               "ShadowHDR · ClearVision · MV-Flow", "산부인과·비뇨기 특화 (BiometryAssist)"]},
        "V7": {"img": "img/v7.png", "desc": ["중상급형, 프리미엄급 기능 탑재", '21.5" 모니터 + 14" 터치',
               "ShadowHDR · HQ-Vision · S-Shearwave(옵션)", "간·유방·갑상선·근골격"]},
        "V8": {"img": "img/v8.png", "desc": ["V 시리즈 최상위 하이엔드", '**23.8" 대형 모니터** + 14" 틸팅 터치',
               "Crystal Architecture · LumiFlow · HQ-Vision", "복부·산부인과·심장·근골격·유방"]}}},
    "ALPINION": {"models": {
        "X-CUBE 50": {"img": "img/xc50.png", "desc": ["X+ Architecture 기반 보급형", '21.5" FHD LED + 12.1" 터치',
                      "Xpeed 원터치 최적화 · Needle Vision Plus", "복부·갑상선·근골격·심장·산부인과"]},
        "X-CUBE 60": {"img": "img/xc60.png", "desc": ["중급형, 320° 회전 모니터 암", '21.5" FHD LED + 12.1" 터치',
                      "X+ MicroView(미세혈류) · ATI(지방간 정량)", "내과·산부인과·근골격·심장"]},
        "X-CUBE 70": {"img": "img/xc70.png", "desc": ['중상급형, 23.8" FHD LED', '12.1" 틸팅 터치 · 5포트',
                      "SWE · pSWE 탄성 · CEUS 조영 · MicroView", "복부·간·유방·심장·산부인과"]},
        "X-CUBE 90": {"img": "img/xc90.png", "desc": ["알피니언 **플래그십** 프리미엄", '23.8" FHD LED + 12.1" 틸팅 터치, 배터리',
                      "간 패키지 (ATI · SWE · CEUS) · Depth View", "복부·간·산부인과·근골격·심혈관"]}}},
}

# 치료장비 초기 품목(개비공 제안서 순서). 마이그레이션이 이 목록을 DB에 넣는다. 이후 수정은 품목 관리 화면에서.
THERAPY_SEED: list[dict] = [
    {"name": n, "maker": mk, "model": md, "note": nt, "warranty": w, "image_key": f"seed/{i:02d}.png"}
    for i, (n, mk, md, nt, w) in enumerate([
        ("ESWT", "아이티시", "ULFORCE", "1) Focus Type\n2) **500만타 보장**", ""),
        ("ESWT", "아이티시", "ULFORCE Radial", "Radial Type", ""),
        ("ESWT", "스트라텍", "TROIKA (FOCUS)", "1) Handpiece 3개\n2) Handpiece당 **1,000만타 보장**", ""),
        ("ESWT", "스트라텍", "ESWT-1000", "Radial Type", ""),
        ("ESWT", "웨버인스트루먼트", "ZEUSWAVE", "Radial + FOCUS", ""),
        ("ESWT", "스톨즈", "Shockwave F1", "", ""),
        ("ESWT", "스톨즈", "SD1 BT F-SW", "", ""),
        ("ESWT", "영인바이오텍", "IN5200", "", ""),
        ("Hot Pack Unit", "", "24P", "", "2년"),
        ("Hot Pack", "삼부메디칼", "고급형", "", ""),
        ("Hot Pack Cover", "삼부메디칼", "고급형", "", ""),
        ("벽걸이 적외선", "윌트리", "IR-VITA", "", "2년"),
        ("I.C.T", "탑메드", "TM-301", "1) 컵 4구+4구=8개\n2) 패드 사용 가능", "2년"),
        ("Therapy Laser", "굿플", "GP-1060L", "플렉시블 케이블", "2년"),
        ("근육마사지기", "스트라텍", "SASSO STS-1000", "소모품 교환 가능", "1년"),
        ("Ion Cooler", "대화티엠", "SERAPIS ION", "1) **Cool+Hot** 기능\n2) 초음파 사용 가능", "2년"),
        ("수 치료기", "현주글로벌메디칼", "AQUA SMART", "1) **동급 최장 파워**\n2) 공간 활용도 극대화", "2년"),
        ("극저온 치료기", "스트라텍", "CRYO-CO2+", "1) 온도센서 기능\n2) 동상방지 기능\n3) 분사량 조절 가능", "2년"),
        ("견인 치료기", "메이저메디칼", "LC-100", "**와이어 없는** 견인치료기", "2년"),
        ("Elevation Bed", "네오텍", "2단 GR-7000", "1) 원터치 구동\n2) Hand · Foot Switch 구성\n3) 팔걸이 가능", "2년"),
        ("Elevation Bed", "네오텍", "1단 GR-7000A", "1) 원터치 구동\n2) Hand · Foot Switch 구성\n3) 팔걸이 가능", "2년"),
        ("자기장 치료기", "스트라텍", "G-500", "출력 **3T**", ""),
        ("자동 혈압계", "인바디", "BpBio320N", "프린터 미지원", "2년"),
        ("소독기 / Autoclave", "엠케이티", "MK-50NS", "50L", "2년"),
        ("두타메트", "OK메디칼", "OK-1", "", ""),
        ("치료베드", "", "", "", ""),
        ("파라핀", "아이젠", "PS100", "", ""),
        ("장화", "원진물산", "WHF-324", "", ""),
    ], start=1)
]


def catalog_for_client() -> dict:
    """작성 화면이 입력 UI를 그리는 데 필요한 목록(문구 제외)."""
    return {
        "xray": [{"model": m, "type": v["type"], "desc_line": v["desc_line"]} for m, v in XRAY_MODELS.items()],
        "xray_detector_types": XRAY_DETECTOR_TYPES,
        "xray_table_types": XRAY_TABLE_TYPES,
        "xray_options": [{"key": k, "label": v} for k, v in XRAY_OPTIONS.items()],
        "mammo": [{"model": m, "brand": v["brand"], "sub": v["sub"]} for m, v in MAMMO_MODELS.items()],
        "carm": [{"model": m, "sub": v["sub"]} for m, v in CARM_MODELS.items()],
        "carm_tables": [{"key": k, "label": f"{v['brand']} {v['model']}"} for k, v in CARM_TABLES.items()],
        "bmd": [{"model": m, "sub": v["sub"]} for m, v in BMD_MODELS.items()],
        "ultrasound": [{"brand": b, "models": list(v["models"].keys())} for b, v in US_BRANDS.items()],
    }
