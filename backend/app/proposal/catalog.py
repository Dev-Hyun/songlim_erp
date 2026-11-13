"""제안서 장비 카탈로그 — 주요 장비의 표시 문구·사진·옵션.

문구 안의 `**…**`는 PDF에서 빨간 굵은 글씨(강조)로 바뀐다.
사진 경로는 `app/proposal/static/` 기준 상대 경로.
장비를 추가하려면 여기 항목과 사진만 넣으면 된다(같은 페이지 종류라면 템플릿 수정 불필요).
"""

XRAY_DETECTOR_TYPES = ["MANO 17x17", "LUMEN 17X17"]
XRAY_TABLE_TYPES = ["PBT-4", "PBT-6", "PBT-6 DELUXE"]

XRAY_MODELS: dict[str, dict] = {
    # E40S Compact: 고를 수 있는 옵션이 따로(options) — Capacitor + WBS-E 두 개만(2026-11-13 New.md)
    "GXR-E40S Compact": {"type": "stand", "sub": "Stand Type", "desc_line": "500mA / 125kV / 40kW, Stand Type",
                         "img": "img/e40s_compact.png", "options": ["capacitor", "wbs_e"], "compact": True},
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
    "auto_positioning": "AUTO POSITIONING (AP CREST) 추가",   # SD(천장형)만
    "wbs_e": "바닥형 월버키, 그리드 (WBS-E) 추가",                # E40S Compact 전용
}
_XRAY_COMMON_OPTIONS = [k for k in XRAY_OPTIONS if k not in ("auto_positioning", "wbs_e")]


def xray_option_keys(model: str) -> list[str]:
    """모델마다 고를 수 있는 옵션(표시 순서 = XRAY_OPTIONS 순서). Compact는 전용 2개, SD(천장형)는 AP CREST가 더 붙는다."""
    spec = XRAY_MODELS[model]
    if "options" in spec:
        return spec["options"]
    return _XRAY_COMMON_OPTIONS + (["auto_positioning"] if spec["type"] == "ceiling" else [])


def xray_include(model: str, detector_count: int, detector_type: str | None, table: str | None) -> list[str]:
    """X-ray INCLUDE 문구 자동 작성 (New.md 지시 문구 그대로)."""
    if XRAY_MODELS[model].get("compact"):
        return ["X-ray System", f"Detector **{detector_count}EA** (MANO 17 X 17)", "설치 및 장비 및 방어시설 검사비용 포함"]
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


# 이동형 X-ray(모바일 DR) — 옵션 없이 금액 + 디텍터(여러 장, 장마다 크기·종류). 한 대에 3장(소개 → 조작 편의 → 맞춤·사양·가격).
MOBILE_DETECTOR_SIZES = ["성인용", "소아용"]
MOBILE_DETECTOR_TYPES = ["LUMEN", "H&abyz", "Mano"]
# 출처: 디알젬 제품 페이지 https://www.drgemhealthcare.com/ko/raymo/ (기능 설명),
#       미국 FDA 510(k) K260085 요약서(제너레이터·회전 범위·콜리메이터·디스플레이·소프트웨어 사양),
#       Smart Control(RADMAX M 태블릿)은 국내 미출시라 넣지 않는다(사용자 요청 2026-11-12).
#       healthcare-in-europe 제품 목록(기능 목록: 소프트웨어 그리드, 듀얼 디텍터 등).
XRAY_MOBILE_MODELS: dict[str, dict] = {
    "RAYMO": {
        # 사진: 사용자가 디알젬 제품 페이지에서 받은 사진·영상(제안서/이미지/RAYMO) — 영상은 한 장면만 잘라 씀
        "sub": "모바일 DR 시스템", "hero": "img/raymo_main.jpg",
        "compact_title": "더 가볍게, 더 작게", "p2_title": "손쉬운 제어를 위한 설계",
        "p3_title": "사용자 맞춤 · 사양 · 제안가", "p3_sec": "RFID 사용자 인식",
        "photos": [("img/raymo_haptic.jpg", "SID 햅틱 피드백"), ("img/raymo_camera.jpg", "주행용 내장 카메라")],
        "monitor": ("img/raymo_monitor.jpg", "자동 틸팅 모니터 · 주행 카메라 화면"),
        "panel": ("img/raymo_panel.jpg", "조작부 — ① 전원 ② 비상정지 ③ 디텍터 잠금 ④⑤ 유·무선 조사 스위치 ⑥ 배터리 표시 ⑦ 바코드 스캐너 ⑧ RFID"),
        "tagline": "컴팩트하고 지능적인, 모든 기능을 갖춘 모바일 엑스레이",
        "lead": "디알젬의 차세대 모바일 X-ray. 더 작고 가벼운 차체에 사용자 맞춤 기능과 임상 편의 기능을 담아 "
                "병동·응급실·중환자실 어디서나 빠르고 안전한 침상 촬영을 돕습니다.",
        "highlights": [("40", "kW", "고주파 제너레이터 · 최대 500mA"), ("20", "%", "기존 모바일 대비 더 작게"),
                       ("10.1", "inch", "틸팅 터치스크린"), ("30", "%", "소프트웨어 그리드 선량 저감 (최대)")],
        "compact": ["기존 모바일 대비 부피 약 **20% 감소**", "**낮은 차체**로 이동 중 전방 시야 확보",
                    "**전동 주행**으로 부드럽고 안정적인 이동", "**접이식 컬럼** · 연장된 암 스트로크"],
        "controls": [
            ("SID 햅틱 피드백", "설정한 SID에 닿으면 손잡이 진동으로 알려 화면을 보지 않고도 **정확한 거리**를 맞춥니다."),
            ("주차 잠금 해제 보조", "주차 위치에서 튜브를 풀면 암이 **자동으로 들어 올려져** 무게 부담 없이 시작합니다."),
            ("간편한 Tube 회전", "콜리메이터 손잡이 옆 버튼을 **누르는 동안만** 자유롭게 돌고, 놓으면 바로 고정됩니다."),
            ("주행용 내장 카메라", "**주·야간 전방 카메라** 화면을 모니터로 보며 좁은 병동도 안전하게 이동합니다."),
            ("Tube 틸팅 터치스크린", "**10.1인치** 터치스크린을 기울여 침상 촬영 중에도 어느 각도에서나 잘 보입니다."),
            ("도난 방지 디텍터 트레이", "**잠금 트레이**가 평판 디텍터를 고정해 분실·낙하를 막습니다.")],
        "imaging": [("자동 콜리메이터", "LED 램프 · 빠른 촬영 준비"), ("RADMAX", "그래픽 APR · 포지셔닝 가이드"),
                    ("소프트웨어 그리드", "그리드 없이 선량 최대 30% 저감"), ("듀얼 디텍터", "성인 · 소아 디텍터 함께 운용")],
        "p3_text": "사원증 태그 한 번으로 **사용자를 인식**해, 사람마다 저장해 둔 설정을 장비가 알아서 맞춥니다.",
        "p3_cards": [("자동 틸팅 모니터", "사용자별로 저장한 각도로 모니터가 기울어집니다."),
                     ("자동 핸들바 위치", "손잡이 높이와 각도를 사용자에게 맞춥니다."),
                     ("자동 주행 감도", "운전 습관에 맞춰 주행 반응을 조절합니다.")],
        "spec": [("제너레이터", "고주파 40 kW · 최대 500 mA"), ("관전압 / mAs", "40 ~ 125 kV (옵션 150 kV) · 0.1 ~ 500 mAs"),
                 ("X-ray Tube", "초점 0.6 / 1.5 mm · 타깃 각도 14°"),
                 ("회전 범위", "컬럼 ±330° · 암 ±180° · 튜브 -30° ~ +90°"),
                 ("콜리메이터", "자동 콜리메이터 · LED 램프"), ("디스플레이", "10.1인치 틸팅 터치스크린"),
                 ("디텍터", "무선 평판 디텍터 · 듀얼 디텍터 지원"), ("소프트웨어", "RADMAX 영상 소프트웨어"),
                 ("구동 / 인증", "전동 주행 · 접이식 컬럼 / FDA 510(k) · CE")],
    },
    # PROMO — 수동형 모바일 DR. 문구: healthcare-in-europe 디알젬 제품 목록 · 디알젬 PROMO 페이지,
    # 사양: 미국 FDA 510(k) K251443 요약서. 사진·영상: 사용자가 디알젬 페이지에서 받은 것(제안서/이미지/*PROMO*)
    "PROMO": {
        "sub": "모바일 DR 시스템 (수동 주행)", "hero": "img/promo_product.png", "hero_stage": True,  # 복도 사진은 제품이 작게 보여 누끼로(2026-11-13)
        "compact_title": "쉽게 밀고, 높게 닿고", "p2_title": "자유로운 포지셔닝과 워크플로우",
        "p3_title": "판독 · 연동 · 사양 · 제안가", "p3_sec": "영상 확인과 연동",
        "photos": [("img/promo_focal.jpg", "높아진 X선 초점 위치"), ("img/promo_push.jpg", "Push-down-and-go 주행")],
        "monitor": ("img/promo_viewer.jpg", "RADMAX 영상 확인"),
        "panel": ("img/promo_rotation.jpg", "컬럼 · 암 · 튜브 회전 범위"),
        "tagline": "누르고 밀면 바로 움직이는 수동형 모바일 DR",
        "lead": "디알젬의 수동형 모바일 X-ray. 손잡이를 눌러 밀기만 하면 움직이는 Push-down-and-go 주행과 "
                "높은 X선 초점 위치로 병동·응급실 어디서나 고화질 침상 촬영을 돕습니다.",
        "highlights": [("40", "kW", "커패시터 제너레이터 · 최대 500mA"), ("21.5", "inch", "배터리 구동 터치 모니터"),
                       ("180", "°", "회전 컬럼 (옵션 ±90°)"), ("AI", "", "진단 보조 · Bone Suppression")],
        "compact": ["**Push-down-and-go** 주행", "높아진 **X선 초점 위치**",
                    "**듀얼 포컬** 튜브 0.6 / 1.5mm", "**디텍터 충전** · 다용도 수납"],
        "controls": [
            ("Push-down-and-go", "손잡이를 **누르고 밀기만 하면** 바로 움직여 수동형인데도 가볍게 이동합니다."),
            ("180° 회전 컬럼", "컬럼이 좌우 **±90°** 돌아(옵션) 침대 어느 쪽에서도 위치를 잡습니다."),
            ("높은 X선 초점 위치", "초점을 **더 높이** 올릴 수 있어 높은 침대와 다양한 자세를 촬영합니다."),
            ("넓은 튜브 회전", "튜브 축 **-49° ~ +147°** 회전으로 각도 촬영이 자유롭습니다."),
            ("21.5인치 터치 모니터", "배터리로 켜지는 **대형 터치스크린**에서 촬영 직후 영상을 확인합니다."),
            ("편리한 구성", "**리모컨** · 상태 표시등 · 다용도 수납 · **디텍터 충전** 내장")],
        "imaging": [("AI 진단 보조", "판독을 돕는 AI 기능"), ("Bone Suppression", "뼈를 지워 폐 병변 확인"),
                    ("S/W Grid", "그리드 없이 산란선 저감"), ("RIS · PACS 연동", "끊김 없는 영상 전송")],
        "p3_text": "촬영 영상을 **대형 터치 모니터**에서 바로 확인하고, RADMAX로 처리해 **RIS · PACS**로 보냅니다.",
        "p3_cards": [("실시간 영상 확인", "촬영 직후 21.5인치 모니터에서 바로 확인합니다."),
                     ("RADMAX", "디알젬 영상 처리 · 촬영 소프트웨어"),
                     ("DAP 미터", "환자 피폭 선량(DAP)을 측정합니다.")],
        "spec": [("제너레이터", "고주파 40 kW · 10 ~ 500 mA"), ("관전압 / mAs", "40 ~ 125 kV · 0.1 ~ 500 mAs"),
                 ("X-ray Tube", "듀얼 포컬 0.6 / 1.5 mm · 타깃 각도 14°"),
                 ("회전 범위", "컬럼 고정 (옵션 ±90°) · 암 ±180° · 튜브 -49° ~ +147°"),
                 ("콜리메이터", "LED 램프 · DAP 미터"), ("디스플레이", "21.5인치 터치스크린 (배터리 구동)"),
                 ("디텍터", "무선 평판 디텍터"), ("소프트웨어", "RADMAX · AI 진단 보조 · S/W Grid"),
                 ("구동 / 인증", "수동 주행 (Push-down-and-go) / FDA 510(k)")],
    },
}

# PACS 소개 페이지 — 3종 가운데 하나를 고른다(제안 품목 X-RAY 안). 모양은 모두 ViewRex3와 같다.
# desc(Copy 수)는 ViewRex3만 — 나머지는 사용자 요청으로 적지 않는다(2026-11-13).
PACS_MODELS: dict[str, dict] = {
    "VIEWREX 3": {
        "brand": "TECHHEIM", "title": "ViewRex3", "warranty": "3년", "desc": "**12 Copy**",
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
    },
    # 문구: 디알젬 제품 페이지 https://www.drgemhealthcare.com/ko/software-gempacs/ (2026-11-13 확인), 화면: 사용자가 받은 사진(제안서/이미지/GEMPACS1~3)
    "GEMPACS": {
        "brand": "DRGEM", "title": "GEMPACS", "warranty": "3년",
        "lead": [
            "GEMPACS는 간단하고 효과적이며 예산 부담이 적은 PACS입니다.",
            "핵심 기능에 집중해 의원·병원·영상센터에서 의료 영상을 저장·검색·조회하며, 디알젬 RADMAX와 통합됩니다.",
        ],
        "feats": [
            "**X-ray · CT · MRI · 초음파** — CT · MR · US · CR · DX 멀티 모달리티",
            "단일 워크스테이션 또는 **전용 서버** 설치, GEMPACS 뷰어로 여러 사용자",
            "처음 쓰는 사람도 쉬운 **직관적인 화면**",
            "한 장 · 여러 장 **레이아웃** 자유 구성, 멀티 프레임 동영상 재생",
            "**간소화된 Worklist**와 빠르고 정확한 **판독 보고서**",
            "크기 · 각도 · 거리 측정, **Cobb 각도** 자동 계산, CT **HU 값** 표시",
            "이미지 **스티칭** · 영역 자르기 · 주석 · 흑백 반전",
            "검사 · 스택 · 시리즈 **3가지 보기 모드**",
        ],
        "imgs": ["img/gempacs1.jpg", "img/gempacs2.jpg", "img/gempacs3.jpg"],
    },
    # 문구·화면: 의사랑(GC메디아이) 제품 페이지 https://www.ysarang.com/ProductIntro/PI0101?idx=150 (UBPACS-Z 탭)
    "UBPACS-Z": {
        "brand": "의사랑 (GC메디아이)", "title": "UBPACS-Z", "warranty": "3년",
        "lead": [
            "UBPACS-Z는 의료기관 내에 분산된 의료 영상 데이터를 통합하는 솔루션입니다.",
            "다양한 의료기기의 영상·의료 데이터를 PACS에서 일원화하여 관리·공유하고 워크플로우를 최적화합니다.",
        ],
        "feats": [
            "**Worklist** — 모든 진료과별 환자 영상 통합, 실시간 조회·판독",
            "원격판독 · 협진의뢰 등 **외부기관과 원활한 연동**",
            "**Viewer** — 여러 검사 동시 비교, 최대 10×10 layout",
            "HP · AL 사용자 맞춤 자동화, Cobb's angle · Cross link 등 모달리티별 Tool",
            "**Report** — 최대 32개 단축키 표준판독, Multi Reporting, G KEY 자동 문장",
            "**EmbeddedEMR** — 의사랑 진료기록 · 검사결과 · 처방내역 확인",
            "진료과 · 검사 · 질환별 **AI 어플리케이션 연동**",
            "모든 EMR/OCS 파트너사 연동, 동의서 · 수술 전후 사진 등 jpg 업로드",
        ],
        "imgs": ["img/ubpacs1.png", "img/ubpacs2.png", "img/ubpacs3.png"],
    },
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
# 보증: GENORAY는 기존 제안서 조건. DRTECH는 부품 조건 없이 기본 3년이고, 제안서마다 직접 고쳐 쓴다(사용자 요청 2026-11-13)
CARM_WARRANTY = {"GENORAY": "3년 (단, TUBE · I.I. · Detector는 2년)", "DRTECH": "3년"}
CARM_NOTE = {"title": "송림메디칼 차별화 서비스", "text": "**C-arm 대체 장비**를 운영하고 있어 문제 발생 시 **즉각 대응**이 가능합니다."}

CARM_MODELS: dict[str, dict] = {
    "ZEN-2090 TURBO": {"brand": "GENORAY", "sub": "9 Inch I.I. (CCD)", "img": "img/zen2090.png", "desc": [
        "**9인치 I.I.** (9 / 6 / 4.5인치 3단 시야)", "고출력 HLF 투시 모드 (2.0kW)",
        "Low Dose · Pulse 모드 · Laser Aimer", "Free Space 740mm · 120° 회전"]},
    "OSCAR PRIME": {"brand": "GENORAY", "sub": "Plate Panel 26×26", "img": "img/oscarprime.png", "desc": [
        "**5.3kW** 발생기 + 쿨링 모듈 탑재", "26×26cm 평판 디텍터(FPD)",
        '10.4" 터치스크린 · DSA 기능', "Low Dose · Auto / Virtual Collimation"]},
    "OSCAR 15": {"brand": "GENORAY", "sub": "Plate Panel 26×26", "img": "img/oscar15.png", "desc": [
        "**15kW** 고출력 발생기 (회전양극관)", "26×26cm 평판 디텍터(FPD)",
        '10.4" 터치스크린 · DSA 기능', "Low Dose · Auto / Virtual Collimation"]},
    "OSCAR 15FD": {"brand": "GENORAY", "sub": "TFT FPD 30×30", "img": "img/oscar15fd.png", "desc": [
        "**15kW** 고출력 발생기 (회전양극관)", "**30×30cm TFT** 평판 디텍터",
        "**43인치 모니터** · DSA 기능", "모션 · 금속 보정, 선량 정보 표시"]},
    "BELLIGER ACE": {"brand": "GENORAY", "sub": "Plate Panel · 모니터 일체형", "img": "img/belliger.png", "desc": [
        "3.2kW 발생기 · **모니터 일체형**", "20×20 CMOS / 21×21 TFT FPD",
        '27" 4K UHD / FHD 모니터 (선택)', "시술 공간 860mm · 3단 선량 모드"]},
    # DRTECH EXTRON — 문구·사양·사진: 디알텍 제품 페이지(drtech.co.kr, s_cate=2212 idx 324 / 292 / 291)
    "EXTRON 3": {"brand": "DRTECH", "sub": "IGZO FPD 21×21 / 23×23", "img": "img/extron3.png", "desc": [
        "**5kW** 고정양극관 (0.6 / 1.2mm), 컴팩트 모니터 카트", "IGZO 평판 디텍터 21×21 / 23×23cm, 픽셀 140 / 148㎛",
        "자동 선량 감지로 불필요한 선량 제거", "Free Space 80.3cm · Depth 73cm · Orbital 165°"]},
    "EXTRON 5": {"brand": "DRTECH", "sub": "IGZO FPD 23×23 / 30×30", "img": "img/extron5.png", "desc": [
        "**4.8kW** 회전양극관 (0.3 / 0.6mm) — 안정적 연속 촬영", "IGZO 평판 디텍터 23×23 / 30×30cm, 픽셀 148㎛",
        "**TRU Image** AI 영상처리 · RNR 노이즈 저감 · AIDC 선량 최적화", "Free Space 80.3cm · Depth 74cm · Orbital 165°"]},
    "EXTRON 7": {"brand": "DRTECH", "sub": "IGZO FPD 23×23 / 30×30", "img": "img/extron7.png", "desc": [
        "**15kW** 고출력 회전양극관 (0.3 / 0.6mm)", "IGZO 평판 디텍터 최대 **30×30cm** FOV, 픽셀 148㎛",
        "AOD 금속 백화 최소화 · RNR · AIDC — 척추 · 외상 · 혈관 시술", "Free Space 80.3cm · Depth 74cm · Orbital 165°"]},
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

# MCT(모바일 CT) — VATECH. C-ARM 다음 순서.
# 출처: SMART M — 바텍엠시스 제품 사진(vatechmcis.com), 사양은 송림메디칼 홈페이지 제품 페이지(바텍 자료).
#       SMART M PLUS — 바텍 보도자료(vatechnetworks.com, 2026-05 국내 판매 개시)와 제품 사진.
MCT_MODELS: dict[str, dict] = {
    "SMART M": {"sub": "부위한정용 소형 CT", "img": "img/mct_smartm.png",
        "size": "W1239 × L2379 × H1572 mm · 599.5 kg (베드 포함) · Bore 580 mm", "desc": [
        "**부위한정용 소형 CT**, 특수의료장비 미해당", "척추 · 어깨 · 사지 · 폐 촬영, Voxel 최대 0.2mm",
        "의료용 CT 대비 **1/10 저선량**, 금속 아티팩트 감소", "설치 공간 **3 × 2m**, 220V 일반 전원"]},
    "SMART M PLUS": {"sub": "근골격계 특화 CT", "img": "img/mct_smartm_plus.png", "desc": [
        "**근골격계 특화** CT (2026 출시)", "MDCT 대비 약 **1/5 저선량**, 검사 시간 단축",
        "**큰 Bore**로 환자 체형 · 포지셔닝 제약 감소", "사지말단 · 두부 · 어깨 · 고관절 급여 촬영 · 척추"]},
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
# 키: xray:모델 / xray_opt:옵션키 / xray_mobile:모델 / pacs:모델 / mammo:모델 / carm:모델 / carm_reducer / mct:모델 / bmd:모델 / us:브랜드:모델
#     / lipus:모델 / eswt:모델 / emg:모델
DEFAULT_PRICES: dict[str, int] = {
    "xray:GXR-E40S Compact": 21_900_000,
    "xray:GXR-E40S Plus": 28_180_000,
    "xray:GXR-40SD": 60_000_000,
    "xray_opt:capacitor": 2_500_000,
    "xray_opt:wbs_e": 1_200_000,
    "xray_opt:auto_positioning": 40_000_000,
    "xray_opt:detector_1d": 10_000_000,
    "xray_opt:ma640": 6_000_000,
    "xray_opt:table_6way": 3_000_000,
    "pacs:VIEWREX 3": 2_000_000,
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
        "xray": [{"model": m, "type": v["type"], "desc_line": v["desc_line"], "options": xray_option_keys(m)}
                 for m, v in XRAY_MODELS.items()],
        "xray_detector_types": XRAY_DETECTOR_TYPES,
        "xray_table_types": XRAY_TABLE_TYPES,
        "xray_options": [{"key": k, "label": v} for k, v in XRAY_OPTIONS.items()],
        "mammo": [{"model": m, "brand": v["brand"], "sub": v["sub"]} for m, v in MAMMO_MODELS.items()],
        "xray_mobile": [{"model": m, "sub": v["sub"]} for m, v in XRAY_MOBILE_MODELS.items()],
        "mobile_detector_sizes": MOBILE_DETECTOR_SIZES,
        "mobile_detector_types": MOBILE_DETECTOR_TYPES,
        "carm": [{"model": m, "brand": v["brand"], "sub": v["sub"]} for m, v in CARM_MODELS.items()],
        "pacs": [{"model": m, "brand": v["brand"], "title": v["title"]} for m, v in PACS_MODELS.items()],
        "carm_tables": [{"key": k, "label": f"{v['brand']} {v['model']}"} for k, v in CARM_TABLES.items()],
        "mct": [{"model": m, "sub": v["sub"]} for m, v in MCT_MODELS.items()],
        "bmd": [{"model": m, "sub": v["sub"]} for m, v in BMD_MODELS.items()],
        "ultrasound": [{"brand": b, "models": list(v["models"].keys())} for b, v in US_BRANDS.items()],
        "lipus": [{"model": m, "brand": v["brand"], "sub": v["sub"]} for m, v in LIPUS_MODELS.items()],
        "eswt": [{"model": m, "brand": v["brand"], "type": v["type"].replace("**", "")} for m, v in ESWT_MODELS.items()],
        "emg": [{"model": m, "brand": v["brand"], "sub": v["sub"]} for m, v in EMG_MODELS.items()],
    }
