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
                 "μ-Scan · SR Flow(저속혈류) · 컬러 파노라마", "산부인과(S-Fetus AI · Auto NT) · 복부 · 심장 · 근골격"]}}},
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

# ---------- 기타장비: LIPUS(골융합치료기) · ESWT(체외충격파) · 근전도 ----------
# 모델이 늘면 각 표에 항목과 사진만 추가하면 된다(표 순서 = 제안서 순서).
LIPUS_MODELS: dict[str, dict] = {
    # 출처: 메디시스 제품 페이지 https://medisys.life/product-cellabone (제조 (주)프로메디, 모델 CB-1000)
    "CELLABONE": {"brand": "스트라텍 (StraTek)", "sub": "CB-1000 · 골유합 촉진기", "img": "img/lipus_cellabone.png", "desc": [
        "**저강도 박동성 초음파(LIPUS)** 골유합 촉진", "**4채널** — 최대 4명 동시 치료",
        "1.5MHz · 30 / 60 mW/cm², 5~30분", "비침습 · 무통, 비급여(조-88)"]},
}

# ESWT는 한 장에 4대까지 칸으로 나눠 싣는다. type = 칸의 TYPE 줄. Warranty 없음.
# 문구 출처: ULFORCE는 아이티시 카탈로그, ULFORCE Radial은 itc21.co.kr, 스트라텍 stratek.kr, 웨버인스트루먼트,
# 스톨즈 2종은 공식 수입사 더블유메딕스(wmedix.com), DUAL WAVE·IN-5200은 대화메디케어(nemectron.co.kr).
# 보장 타수는 기존 제안서(송림메디칼 조건) 문구.
ESWT_MODELS: dict[str, dict] = {
    "ULFORCE": {"brand": "아이티시 (ITC)", "type": "**Focus**", "img": "img/eswt_ulforce.png", "desc": [
        "**초점형 피에조** 체외충격파 (ESWT Piezo)", "강도 1~25단계 / 주파수 1~5Hz",
        "에너지 0.0006~0.4028 mJ/mm²", "침투 깊이 10·20·30mm, **500만타 보장**"]},
    "ULFORCE Radial": {"brand": "아이티시 (ITC)", "type": "**Radial**", "img": "img/eswt_ulforce_r.png", "desc": [
        "**공기압 방사형** 체외충격파", "충격 압력 1.0~5.0 bar",
        "주파수 **1~17Hz**", "트랜스미터 F15 · R15 · R20"]},
    "TROIKA (FOCUS)": {"brand": "스트라텍 (StraTek)", "type": "**Focus**", "img": "img/eswt_troika.png", "desc": [
        "**Handpiece 3개**, 개당 **1,000만타 보장**", "압전식 집중형, 침투 깊이 10·20·30mm",
        "세기 0.5~20 Level / 1~10Hz", "터치스크린 · 다이오드 레이저 내장"]},
    "ESWT-1000": {"brand": "스트라텍 (StraTek)", "type": "**Radial**", "img": "img/eswt_eswt1000.png", "desc": [
        "**공압식 방사형** 체외충격파", "출력 압력 **1~7 bar**",
        "출력 주파수 1~10Hz", "자극 횟수 1,000~9,999회 설정"]},
    "ZEUS WAVE": {"brand": "웨버인스트루먼트", "type": "**Radial + Focus**", "img": "img/eswt_zeuswave.png", "desc": [
        "**Piezo 집중형 + 공기압 방사형** 통합", "고강도 레이저(HILT) **15W** 탑재",
        "집중형 최대 0.702mJ/mm², 깊이 40mm", "방사형 0.5~7.0 bar / 1~10Hz, 팁 8종"]},
    "SHOCK WAVE F1": {"brand": "STORZ MEDICAL (스톨즈)", "type": "**Focus**", "img": "img/eswt_f1.png", "desc": [
        "**컴팩트 집중형(Focus)** 충격파", "에너지 0.01~0.55 mJ/mm²",
        "유효 침투 깊이 **50mm**", "인체공학 New 핸드피스, 저렴한 소모품"]},
    "SD1 BT F-SW": {"brand": "STORZ MEDICAL (스톨즈)", "type": "**Focus**", "img": "img/eswt_sd1.png", "desc": [
        "DUOLITH **집중형(Focus) 단독** 모델", "터치스크린 · 핸드피스에서 조절",
        "에너지 0.01~0.55 mJ/mm² 단계 선택", "유효 침투 깊이 **50mm**"]},
    "IN-5200": {"brand": "영인바이오텍", "type": "**Radial + Focus**", "img": "img/eswt_in5200.png", "desc": [
        "**Array Piezo 집중형 + Radial** 듀얼", "에너지 0.07~0.82mJ/mm²",
        "Radial 최대 4.0 bar / 1~15Hz", "10.1인치 터치스크린"]},
    "DUAL WAVE PLUS": {"brand": "대화메디케어", "type": "**Radial + Focus**", "img": "img/eswt_dualwave.png", "desc": [
        "**Radial + Focus** 충격파 한 대로", "방사형 · 집중형 손쉬운 전환",
        "Focus 프로브 3종 (초점 10/20/30mm)", "Radial 프로브 3종"]},
}

# 근전도 — 지금은 Natus 1종(하이메드 공급). 장비 = Keypoint Focus, 소프트웨어 = Elite.
# 문구·사진 출처: 하이메드 제품 페이지(https://www.himed.co.kr/page/product01).
EMG_MODELS: dict[str, dict] = {
    "Keypoint Focus": {"brand": "Natus (하이메드)", "sub": "EMG · NCS · EP", "img": "img/natus_keypoint.png",
        "desc": ["2025 최신 **Natus Elite** 소프트웨어 탑재", "EMG · NCS · EP 검사, **3 · 4 · 6 · 8채널** 선택",
                 "**Auto Summary**로 검사 · 보고서 간편화", "높은 CMRR · 저노이즈로 안정된 레코딩"]},
}

# 처음 고를 때 들어가는 기본 금액 — 기존 제안서(2026-06~09)의 마지막 금액.
# 제안서를 저장하면 그때 금액이 proposal_last_prices에 남아 다음부터 그 값이 기본값이 된다(누가 만들든 마지막 값).
# 키: xray:모델 / xray_opt:옵션키 / pacs / mammo:모델 / carm:모델 / carm_reducer / bmd:모델 / us:브랜드:모델
#     / lipus:모델 / eswt:모델 / emg:모델
DEFAULT_PRICES: dict[str, int] = {
    "xray:GXR-E40S Plus": 28_180_000,
    "xray:GXR-40SD": 60_000_000,
    "xray_opt:capacitor": 2_500_000,
    "xray_opt:detector_1d": 10_000_000,
    "xray_opt:ma640": 6_000_000,
    "xray_opt:table_6way": 3_000_000,
    "pacs": 2_000_000,
    "mammo:AIDIA UD": 130_000_000,
    "mammo:AIDIA TDB": 80_000_000,
    "mammo:AIDIA VOLVE": 55_000_000,
    "mammo:PINKVIEW BT": 43_000_000,
    "carm:ZEN-2090 TURBO": 42_000_000,
    "carm:OSCAR PRIME": 53_000_000,
    "carm:OSCAR 15FD": 99_000_000,
    "carm:BELLIGER ACE": 47_000_000,
    "carm_reducer": 4_500_000,
    "bmd:DEXXUM T QUANTUM": 17_500_000,
    "bmd:PRIMUS": 44_000_000,
    "lipus:CELLABONE": 9_900_000,
    "eswt:ULFORCE": 11_000_000,
    "eswt:ULFORCE Radial": 7_700_000,
    "eswt:TROIKA (FOCUS)": 13_200_000,
    "eswt:ESWT-1000": 5_330_000,
    "eswt:ZEUS WAVE": 17_600_000,
    "eswt:IN-5200": 17_600_000,
    "eswt:DUAL WAVE PLUS": 14_300_000,
    "emg:Keypoint Focus": 25_000_000,
}

# 치료장비 초기 품목의 기본 단가·수량(개비공 제안서). THERAPY_SEED와 같은 순서. None = 기존 제안서에 금액 없음.
THERAPY_SEED_PRICES: list[tuple[int | None, int]] = [
    (11_000_000, 1), (7_700_000, 1), (13_200_000, 1), (5_330_000, 1), (17_600_000, 1), (None, 1), (None, 1),
    (17_600_000, 1), (660_000, 1), (7_400, 24), (7_400, 24), (143_000, 10), (990_000, 5), (1_430_000, 1),
    (990_000, 2), (1_870_000, 1), (5_400_000, 3), (4_400_000, 1), (3_900_000, 1), (800_000, 4), (700_000, 1),
    (4_400_000, 1), (1_000_000, 1), (3_000_000, 1), (363_000, 10), (99_000, 10), (77_000, 1), (230_000, 6),
]

# 치료장비 초기 품목(개비공 제안서 순서). 마이그레이션이 이 목록을 DB에 넣는다. 이후 수정은 품목 관리 화면에서.
# 1~8번 ESWT는 '기타장비 → ESWT'로 옮겨 가 마이그레이션 c4e8a2f6b1d3이 품목에서 지운다(사진 번호 seed/NN 유지를 위해 목록은 그대로).
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
        ("두타메트", "OK메디칼", "OKB-01", "", ""),
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
        "lipus": [{"model": m, "brand": v["brand"], "sub": v["sub"]} for m, v in LIPUS_MODELS.items()],
        "eswt": [{"model": m, "brand": v["brand"], "type": v["type"].replace("**", "")} for m, v in ESWT_MODELS.items()],
        "emg": [{"model": m, "brand": v["brand"], "sub": v["sub"]} for m, v in EMG_MODELS.items()],
    }
