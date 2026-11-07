# 제안서 제작 (개원의 제안서) — 설계서

- 작성일: 2026-11-07 (2차 수정: 치료장비·강조 표시·핑크뷰 디텍터·저감장치 반영)
- 요구사항 원본: `New.md` 2299줄 이후 + 대화 중 추가 지시
- 디자인 시안: https://claude.ai/artifact/EncoCR2noYh1YiQoxD8gzg (로컬 `보고서/제안서_디자인초안/index.html`)
- 상태: 사용자 검토 대기

## 1. 목표

사이트에서 장비를 클릭으로 고르고 금액을 입력하면, 병원명·원장님·제안일이 들어간 견적 제안서 PDF가 바로 나온다.
폰에서도 같은 PDF가 나와야 하고, 만든 제안서는 저장해 두었다가 다시 열거나 복사해서 금액만 바꿔 다시 뽑을 수 있어야 한다.

### 이번 범위
- 사이드바 "제안서 제작" → "개원의 제안서 제작" 메뉴
- 장비 카테고리 5개: X-RAY SYSTEM, MAMMOGRAPHY, C-ARM, BMD, ULTRASOUND
- 소개 페이지 4종: PACS(ViewRex3), 전동테이블(HCK C301 / 01M X3-C), C-arm 저감장치(CARESON SELD X70)
- **치료장비** 품목표 페이지 + 치료장비 품목 관리 화면(품목 추가·수정·사진 업로드)
- 디자인 2종: A 클리닉 블루(기본), C 송림 그린 — 제안서마다 선택
- 중요 포인트 강조 표시(빨간 굵은 글씨)
- 저장 · 목록 · 복사 · 삭제 · PDF 다운로드

### 이번 범위가 아닌 것
- "기타 제안서 제작" — 내용을 받으면 별도 설계. 그 전에는 메뉴에 넣지 않는다.
- 주요 장비(X-RAY~ULTRASOUND)의 모델·설명·사진을 화면에서 편집하는 기능 — 코드의 카탈로그 파일로 관리(7절). 화면 편집은 치료장비만.
- 개비공 제안서의 "치료장비 조언" 페이지(자유 문구) — 요청 시 추가

## 2. 결정된 사항 (사용자 확인 완료)

| 항목 | 결정 |
|---|---|
| PDF 생성 방식 | 서버에서 크롬(Playwright)으로 HTML을 PDF로 인쇄 |
| 디자인 | A(기본) / C 중 제안서마다 선택, 저장됨, 나중에 바꿔서 다시 뽑기 가능 |
| 마지막 2장 | "함께 하는 이유" + "감사합니다" 포함, 내용은 기존 그대로·디자인은 새로, 담당자는 입력 |
| 저장 | 저장 + 목록 + 복사해서 수정 |
| 복수 선택 | 한 카테고리에서 여러 모델 선택 가능, 모델당 1페이지 |
| 기존장비 인수금액 | 모든 장비에 선택 입력칸, 입력했을 때만 PDF에 표시 |
| 장비 사진 | 흰 배경 제거, 같은 바닥선, 같은 면적 규칙으로 크기 자동 맞춤 |
| 초음파 | 브랜드 여러 개 선택 가능, 브랜드당 1페이지, 페이지 안에 고른 모델 1~4개 |
| PACS 브랜드 | TECHHEIM |
| AIDIA TDB 설명 | 기존 제안서 문구 그대로 |
| 전동테이블 가격 | 입력칸 없음, 항상 "C-arm 견적에 포함" |
| 핑크뷰 | DRTECH RSM 1824C 디텍터 사진·설명을 같은 페이지에 함께 |
| 저감장치 | 저감장치 제품 사진이 메인, 설치 모습·선량 비교 사진을 아래에 |
| C-arm 대체 장비 문구 | 유지 |
| 강조 | 원본 제안서처럼 중요 포인트를 색·굵기로 강조 |
| 치료장비 | 개비공 제안서 형식의 품목표, 품목은 우리가 수정, 단가·수량은 제안서마다 입력, 합계 줄 없음 |

## 3. 페이지 구성

```
1  표지            병원명 · 원장님 이름 · 제안일 · 담당자 (A는 제안 품목 목차 포함)
2  회사 소개        고정 문구
3~ 장비 페이지      아래 순서, 고른 것만
   치료장비 페이지  고른 품목, 8줄씩 (합계 없음)
n-1 함께 하는 이유  고정 문구 (SERVICE / PRICE / PROMOTION)
n  마지막 장        담당자 이름 · 직함 · 연락처
```

장비 페이지 순서(카테고리 순서 고정, 카테고리 안에서는 카탈로그 순서):

1. **X-RAY SYSTEM** — 고른 X-ray 모델 각 1장 → PACS 소개(선택 시) 1장
2. **MAMMOGRAPHY** — 고른 모델 각 1장
3. **C-ARM** — 고른 C-arm 모델 각 1장 → 전동테이블(HCK 또는 01M 중 하나) 1장 → 저감장치(선택 시) 1장
4. **BMD** — 고른 모델 각 1장
5. **ULTRASOUND** — 고른 브랜드 각 1장 (DRGEM → SAMSUNG MEDISON → ALPINION)
6. **치료장비** — 고른 품목을 관리 화면 순서대로, 8줄씩 나눠 여러 장

모든 장비 페이지 하단에 "VAT 포함 금액입니다." 표시. 쪽 번호는 `n / 전체`.

## 4. 카테고리별 입력 항목과 PDF 표시

### 4.1 X-RAY SYSTEM (Brand DRGEM, Warranty `3 YEAR` 고정)

| 모델 | Description | 입력 |
|---|---|---|
| GXR-E40S Plus | 500mA / 125kV / 40kW, Stand Type | Detector 개수 |
| GXR-40SD | 500mA / 125kV / 40kW, Ceiling Type, Tube: CSE | Detector 종류(MANO 17x17 / LUMEN 17X17)·개수, Table(PBT-4 / PBT-6 / PBT-6 DELUXE) |
| GXR-52SD | 640mA / 150kV / 52kW, Ceiling Type, Tube: CSE | 〃 |
| GXR-68SD | 800mA / 150kV / 68kW, Ceiling Type, Tube: CSE | 〃 |
| GXR-82SD | 1000mA / 150kV / 82kW, Ceiling Type, Tube: CSE | 〃 |

공통 입력: Price(필수), 기존장비 인수금액(선택), OPTIONS(체크 + 금액).

INCLUDE 자동 작성(강조 = 빨간 굵은 글씨):
- E40S Plus: `1) X-ray System` `2) Detector {n}EA (MANO 17 X 17)` `3) Stand Bucky & 4Way Table` `4) 설치 및 장비 및 방어시설 검사비용 포함` — `{n}EA` 강조
- SD 시리즈: `1) X-ray System (CEILING)` `2) DETECTOR {n}EA ({종류})` `3) TABLE : {종류}` `4) 설치 및 잔넬 공사비용 포함` `5) 장비 및 방어시설 검사비용 포함` — `{n}EA`, 4)번 강조

OPTIONS 후보(체크한 것만 표시): Capacitor / 6WAY TABLE 변경 / 6WAY DELUXE TABLE (하단 개방형) 변경 / 640mA(52SD) 변경 / 800mA(68SD) 변경 / 1000mA(82SD) 변경 / DETECTOR 1D 추가 / DETECTOR LUMEN 17X17 변경 / AUTO SYNC 추가 (CSA-A) / AUTO STICHING 추가 (CSA-AS) / STICHING STAND 추가

사진: E40S Plus → E40S PLUS 사진, SD 시리즈 → SD시리즈 사진.

**PACS 소개 페이지**(X-RAY 카테고리에서 체크): Brand TECHHEIM, Model VIEWREX 3, Warranty 3년, Description `12 Copy`, Price 입력. ViewRex3 화면 사진 3장 + 소개 문구 + 주요 기능 8줄(New.md 문구 그대로).

### 4.2 MAMMOGRAPHY (Warranty `3년` 고정)

| 모델 | Brand | 비고 |
|---|---|---|
| AIDIA LUXE (3D TOMO) | DRTECH | |
| AIDIA UD (직접방식) | DRTECH | 사진은 UD·TD·TDB 공용 |
| AIDIA TD (간접방식) | DRTECH | 〃 |
| AIDIA TDB (간접방식) | DRTECH | 설명은 기존 제안서 그대로: 24×30 Screening / Small & Implant (유상) / Spot (유상) / Magnification Set (확대촬영 세트) / Localization Set (조직검사 세트) (유상) |
| AIDIA VOLVE (간접방식) | DRTECH | |
| PINKVIEW BT + DRTECH RSM1824C | BEMEMS | INCLUDE: DRTECH DETECTOR [RSM 1824C], 설명 4줄은 New.md 고정 문구 |

**핑크뷰 디텍터 상자**: 핑크뷰 페이지 안에 RSM 1824C 사진과 설명을 함께 넣는다(DRTECH 공식 페이지 기준).
- 76㎛ 작은 픽셀의 고해상도 고품질 영상 / 기존 장비·AEC Sensor 완벽 호환, 간편한 업그레이드 / 필름 CR IP 카세트와 동일 사이즈 / 세계 40여 개국에서 사용되는 검증된 제품
- 사양 한 줄: CsI 직접증착 · 2,304 × 3,072 · 194.5 × 267.5 × 14.2mm · 0.92kg

입력: Price, 기존장비 인수금액(선택). DESCRIPTIONS는 카탈로그 고정 문구.

### 4.3 C-ARM (Brand GENORAY)

모델: ZEN-2090 TURBO / OSCAR PRIME / OSCAR 15 / OSCAR 15FD / BELLIGER ACE

- Warranty 고정(강조): `3년 (단, TUBE · I.I. · Detector는 2년)`
- INCLUDE 고정: `Main Body, 방호판 및 납복` / `C-arm 장비 검사 및 방어시설 검사` / `전동테이블 포함`(강조)
- DESCRIPTION: 모델별 카탈로그 문구
- 입력: Price, 기존장비 인수금액(선택)
- 하단 메모: "송림메디칼 차별화 서비스 · **C-arm 대체 장비**를 운영하고 있어 문제 발생 시 **즉각 대응**이 가능합니다."

**전동테이블 페이지**(C-ARM에서 HCK / 01M / 없음 중 선택, 1장). 가격 입력칸 없이 항상 "C-arm 견적에 포함"으로 표시.
- HCK C301 — 개비공 제안서 내용 그대로: 전동 1단 C-ARM 테이블, W600 × D2000 × H600~1000mm, 100KG, 220V/60Hz, 1CH HAND, UP·DOWN, Warranty 1년. 사진 C301 + 도면.
- 01M X3-C — 01M 홈페이지(01m.co.kr/897) 기준: Frame-less · High Quality Image · Premium Specifications(LINAK) · Low Position 650mm · Elevation·Tilting · Automatic alignment, W600 × L2,000 × H650~950mm, 90kg, 안전하중 135kg, Warranty 1년. 사진 4장(본체 + 컬럼 · Low Position · Radiation Shield 옵션).

**저감장치 페이지**(C-ARM에서 체크, 1장): CARESON SELD X70, Warranty 3 YEAR, Price 입력.
- 메인 사진: 케어슨 공식 제품 사진(저감 필터 본체)
- 아래 2장: "C-arm 튜브에 밀착 장착"(케어슨 장착 위치 그림), "장착 전·후 선량 비교 (제조사 측정)"(케어슨 그래프)
- 설명 4줄: 튜브 끝 장착형 방사선 저감 필터 / 선량 **최대 87% 저감** (제조사 측정) / 영상 화질 손실 없이 필터링 / C-arm 모델별 튜브 맞춤 정밀 가공

### 4.4 BMD (Brand OSTEOSYS, Warranty `3년` 고정)

모델: DEXXUM T / DEXXUM T QUANTUM / PRIMUS. 입력: Price, 기존장비 인수금액(선택).
DESCRIPTION과 SIZE(크기·무게)는 카탈로그 문구.

### 4.5 ULTRASOUND (Warranty `3년` 고정)

| 브랜드 | 모델 |
|---|---|
| DRGEM | DS20, DS30 |
| SAMSUNG MEDISON | V5, V6, V7, V8 |
| ALPINION | X-CUBE 50, 60, 70, 90 |

브랜드 체크 → 그 브랜드 모델 체크(1개 이상) → 모델마다 Price 입력. 브랜드당 1페이지, 모델 수만큼 칸을 나눈다(1~4칸).

### 4.6 치료장비 (개비공 제안서 형식)

**PDF 표** — 열: `No. | 품명 | Image | 제조사 / 모델 | 단가 | 수량 | 공급금액 (VAT 포함) | 비고 | Warranty`
- 공급금액 = 단가 × 수량 (자동 계산)
- 수량이 2 이상이면 수량을 빨간 굵은 글씨로(원본 제안서 방식)
- 비고는 여러 줄 가능, `**…**`로 감싼 부분은 강조
- 한 페이지에 8줄, 넘치면 다음 페이지로. 합계 줄은 넣지 않는다(사용자 지시).
- No.는 제안서 안에서 1부터 다시 매김

**제안서 작성 화면** — 치료장비 패널에서 품목을 체크하고 품목마다 단가·수량 입력(단가 필수, 수량 기본 1).

**품목 관리 화면**(우리가 수정) — 품명 · 제조사 · 모델명 · 사진 · 비고 · Warranty · 표시 순서 · 사용 여부
- 사진 업로드 시 서버가 자동 처리: 흰 여백 잘라내기 → 긴 변 800px 이하로 축소 → PNG 저장. PDF에서는 칸(104 × 54px)에 비율 유지로 맞춤.
- 지우기 대신 "사용 안 함"으로 숨긴다(과거 제안서 보존).
- 단가는 품목에 저장하지 않는다. 항상 제안서마다 입력한다.

**초기 품목 28개**(개비공 제안서 순서): ESWT ULFORCE / ULFORCE Radial / 스트라텍 TROIKA (FOCUS) / 스트라텍 ESWT-1000 / ZEUSWAVE / 스톨즈 Shockwave F1 / 스톨즈 SD1 BT F-SW / 영인 IN5200 / Hot Pack Unit 24P / Hot Pack 고급형 / Hot Pack Cover 고급형 / 벽걸이 적외선 IR-VITA / I.C.T TM-301 / Therapy Laser GP-1060L / 근육마사지기 SASSO STS-1000 / Ion Cooler SERAPIS ION / 수 치료기 AQUA SMART / 극저온 치료기 CRYO-CO2+ / 견인 치료기 LC-100 / Elevation Bed 2단 GR-7000 / Elevation Bed 1단 GR-7000A / 자기장 치료기 G-500 / 자동 혈압계 BpBio320N / 소독기 MK-50NS / 두타메트 OK-1 / 치료베드 / 파라핀 PS100 / 장화 WHF-324.
비고·Warranty는 개비공 제안서 문구 그대로. 사진은 제조사·판매처 웹 이미지로 새로 받아 배경을 정리해 넣는다. 원본 제안서보다 선명한 사진을 쓴다.

## 5. 강조 표시 규칙

원본 제안서의 빨간 글씨를 정리한 규칙. 색은 디자인별(A `#D2372B`, C `#C2352A`), 굵게.
- 카탈로그·품목 문구에서 `**…**`로 감싼 부분 → 강조 (예: `**65㎛** 최소 픽셀`)
- 항상 강조: Warranty 값, 디텍터 수량(`2EA`), `전동테이블 포함`, 수량 2 이상(치료장비)
- C 디자인의 녹색 메모 상자 안에서는 노란색으로 바꿔 대비 확보
- 가격은 이미 가장 크게 보이므로 따로 강조하지 않는다

## 6. 화면 (프론트엔드)

### 6.1 사이드바
"자료실" 바로 위에 **제안서 제작** 그룹 → 하위 **개원의 제안서 제작**(`/proposals`), **치료장비 품목 관리**(`/proposals/therapy-items`).
송림 직원(`require_staff`)에게만 보인다.

### 6.2 목록 `/proposals`
- 열: 병원명 · 원장님 · 제안일 · 담당자 · 디자인 · 작성자 · 수정일
- 검색(병원명·원장님), 최신 수정순
- 행 동작: 열기 · 복사 · PDF · 삭제(작성자 또는 관리자만, 화면 안 확인 단계 포함)
- 폰: 표 대신 카드

### 6.3 작성·수정 `/proposals/new`, `/proposals/{id}`
- **기본 정보**: 병원명 · 원장님 이름 · 제안일(기본 오늘) · 담당자 이름 · 직함 · 연락처(로그인 사용자 정보로 기본값)
- **디자인**: [A 클리닉 블루] [C 송림 그린], 기본 A
- **카테고리 6개** 펼침 패널: 모델/품목 체크 → 입력칸 펼침(4절)
- 금액 입력: 숫자만, 천 단위 쉼표 자동, 저장은 정수(원)
- **미리보기**: PC는 오른쪽 패널(입력 후 0.6초 뒤 갱신), 폰은 상단 [입력 | 미리보기] 탭
- 하단 고정 바: [저장] [PDF 다운로드]
- 필수값 누락(병원명, 원장님, 고른 장비·품목의 가격) → 해당 칸 빨간 안내, PDF 버튼 비활성

### 6.4 치료장비 품목 관리 `/proposals/therapy-items`
- 표: 순서 · 사진 · 품명 · 제조사 · 모델 · 비고 · Warranty · 사용 여부
- 추가 / 수정(같은 폼) / 사용 안 함 / 순서 변경(재고관리 화면과 같은 드래그 손잡이)
- 사진 업로드: 파일 선택 또는 폰 카메라, 올리면 자동으로 잘라내고 줄인 결과를 바로 보여줌
- 폰: 카드 목록 + 하단 시트 편집

## 7. 서버 (백엔드)

### 7.1 데이터

**`proposals`** (제안서)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| kind | str | `clinic` (기타 제안서 대비) |
| hospital_name / doctor_name | str | |
| proposal_date | str `YYYY-MM-DD` | |
| rep_name / rep_title / rep_phone | str | 마지막 장 담당자 |
| design | str | `A` \| `C` (CHECK) |
| items | JSON(text) | 고른 장비와 입력값 |
| author_id | FK users | |
| copied_from_id | int null | 복사 원본 |
| created_at / updated_at | | TimestampMixin |

**`proposal_therapy_items`** (치료장비 품목)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | int PK | |
| name | str | 품명 |
| maker | str null | 제조사 |
| model | str null | 모델명 |
| note | str null | 비고 (줄바꿈 가능, `**강조**`) |
| warranty | str null | 예: `2년` |
| image_key | str null | 처리된 사진 파일 키 |
| sort_order | int | |
| is_active | bool | 사용 여부 |
| created_at / updated_at | | |

`items` 예시:
```json
{
  "xray": [
    {"model": "GXR-E40S Plus", "detector_count": 1, "price": 28980000, "tradein": 1000000,
     "options": [{"key": "detector_1d", "price": 11000000}, {"key": "capacitor", "price": 2500000}]},
    {"model": "GXR-52SD", "detector_type": "LUMEN 17X17", "detector_count": 2, "table": "PBT-6", "price": 52800000}
  ],
  "pacs": {"price": 2000000},
  "mammo": [{"model": "PINKVIEW BT", "price": 43000000}],
  "carm": [{"model": "ZEN-2090 TURBO", "price": 42500000}],
  "carm_table": "HCK",
  "carm_reducer": {"price": 4500000},
  "bmd": [{"model": "DEXXUM T QUANTUM", "price": 17500000}],
  "ultrasound": [{"brand": "SAMSUNG MEDISON", "models": [{"model": "V7", "price": 45000000}]}],
  "therapy": [
    {"item_id": 13, "unit_price": 990000, "qty": 5,
     "snapshot": {"name": "I.C.T", "maker": "…", "model": "TM-301", "note": "1) 컵 4구+4구=8개\n2) 패드 사용 가능", "warranty": "2년", "image_key": "…"}}
  ]
}
```
- 치료장비는 저장할 때 품목 정보를 `snapshot`으로 같이 저장한다. 나중에 품목을 고쳐도 이미 만든 제안서의 PDF는 그대로 나온다. 복사해서 새로 만들 때는 최신 품목 정보로 다시 채운다.
- 서버에서 Pydantic으로 검증, 카탈로그에 없는 모델·옵션 키나 없는 품목 id는 거부.

### 7.2 API (모두 `require_staff`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/proposals` | 목록(검색어 `q`) |
| POST | `/api/proposals` | 생성 |
| GET / PUT / DELETE | `/api/proposals/{id}` | 조회 / 수정 / 삭제(작성자 또는 관리자) |
| POST | `/api/proposals/{id}/copy` | 복사 → 새 id, 제안일은 오늘 |
| POST | `/api/proposals/preview` | 저장 전 내용으로 미리보기 HTML |
| GET | `/api/proposals/{id}/pdf` | PDF 다운로드 |
| GET | `/api/proposals/catalog` | 화면용 카탈로그(모델·옵션) + 사용 중인 치료장비 품목 |
| GET / POST | `/api/proposals/therapy-items` | 품목 목록(사용 안 함 포함 옵션) / 추가 |
| PUT | `/api/proposals/therapy-items/{id}` | 수정(사용 여부 포함) |
| POST | `/api/proposals/therapy-items/reorder` | 순서 변경 `{ids}` |
| POST | `/api/proposals/therapy-items/{id}/image` | 사진 업로드 → 자동 처리 후 저장 |

PDF 파일명: `{제안일}_제안서_{병원명} {원장님}원장님.pdf` (기존 파일명 규칙).

### 7.3 사진 자동 처리 (치료장비 업로드)
기존 `app/image_utils.py`(HEIC 변환 포함)를 재사용한 뒤:
1. 가장자리와 같은 밝은 배경(흰색·연회색)을 경계선에서부터 잘라내 투명 처리
2. 남은 내용 기준으로 여백 잘라내기
3. 긴 변 800px 이하로 축소, PNG 저장 (업로드 폴더 `uploads/proposal-therapy/`)
4. 원본도 함께 보관(나중에 다시 처리할 수 있게)

### 7.4 렌더링
- 템플릿: 백엔드 Jinja2 HTML 하나로 미리보기와 PDF를 모두 만든다.
  `app/proposal/templates/{a,c}/` 아래 페이지 종류별 파셜(cover, intro, eq, pacs, hck, x3c, seld, us, rx, why, thx).
- 페이지 크기: 1123 × 794px = A4 가로. `page.pdf(width="297mm", height="210mm", print_background=True)`.
- 폰트: IBM Plex Sans KR(A), Gothic A1(C)은 Google Fonts에서 읽고, 서버 이미지에 `fonts-noto-cjk`를 깔아 네트워크 문제 시에도 한글이 깨지지 않게 한다(한글 폰트 파일 수십 MB를 저장소에 넣지 않기 위함).
- 주요 장비 사진: `app/proposal/static/img/` — 시안에서 정리한 PNG를 그대로 옮긴다.
- 사진 크기 규칙: 장비 면적 = 무대 면적 × 0.44, 바닥선 정렬. Playwright는 `document.fonts.ready`와 이미지 로드를 기다린 뒤 인쇄.
- Playwright: 브라우저 1개를 앱 수명 동안 유지, 요청마다 새 페이지. 동시 생성 2개로 제한.

### 7.5 배포 영향
- 백엔드 Docker 이미지에 `playwright` + `chromium` 설치 → 이미지 약 400MB 증가. **배포 전 서버 디스크 여유 확인 필요.**
- 마이그레이션 1개(`proposals`, `proposal_therapy_items` 생성 + 초기 품목 28개 입력). 기존 데이터 영향 없음.

## 8. 주요 장비 카탈로그 관리
`app/proposal/catalog.py` 한 파일에 카테고리 → 모델 → {brand, 표시 문구(`**강조**` 포함), 사진, 고정 INCLUDE, 옵션 후보}.
- 장비 추가 = 카탈로그 항목 + 사진. 같은 페이지 종류면 템플릿 수정 불필요.
- 프론트 입력 화면은 `/api/proposals/catalog`로 그려서 카탈로그만 바꾸면 화면도 따라온다.

## 9. 오류 처리
- 필수값 누락 → 422, 화면은 해당 칸 표시
- 카탈로그에 없는 모델/옵션, 없는 품목 → 422
- 사진 업로드: 이미지가 아니거나 10MB 초과 → 422 + 안내
- PDF 생성 실패(크롬 오류·30초 초과) → 503 + "PDF를 만들지 못했습니다. 잠시 후 다시 시도해 주세요." 로그 남김
- 남이 만든 제안서 삭제 → 403

## 10. 확인이 더 필요한 항목
1. **AIDIA UD / TD 이름** — 공식 사이트는 지금 "AIDIA NEX (직접방식)/(간접방식)". 제안서는 요청대로 UD/TD 표기.
2. **DEXXUM T QUANTUM 무게** — 기존 제안서 130.5kg, 제조사 KR 페이지 145kg. 시안은 145kg.
3. **삼성 V 시리즈** — S-Shearwave, S-Detect 등 일부는 유상 옵션이라 "(옵션)" 표시.
4. **01M X3-C Warranty 1년** — 기존 X3-A 제안서 기준.
5. **치료장비 제조사** — 원본 제안서에 제조사가 비어 있는 품목은 사진 조사 때 확인한 제조사로 채웠다(시안 표 참고). 다르면 품목 관리 화면에서 고치면 된다.
6. **치료장비 사진 중 확인 필요** (모두 품목 관리 화면에서 사진 교체 가능)
   - 1 ULFORCE — 아이티시 공식 사진이 현재 모델(Ulforce Blue plus). 예전 탁상형 ULFORCE라면 교체 필요
   - 9 Hot Pack Unit 24P — 24P를 만드는 회사가 여러 곳. 사진은 카리스 KRS-24PD, 제조사 칸은 비워 둠
   - 11 Hot Pack Cover — 깨끗한 사진이 나무 바닥 배경뿐이라 그대로 사용
   - 16 SERAPIS ION — 찾은 사진이 후속 모델 ION+(DH-1)
   - 17 AQUA SMART — 브로슈어 사진이라 2대와 물결 그래픽이 함께 있음
   - 20·21 GR-7000 / 7000A — 제조사를 네오텍으로 추정(카탈로그 로고 기준)
   - 23 BpBio320N — 공식 사진이 프린터가 있는 320 모델과 같은 사진
   - 25 두타메트 OK-1 — "OK-1" 모델명이 없어 OK메디칼 OKB-01로 판단

## 11. 테스트·검증
- pytest: 제안서 CRUD·복사, 권한(병원 계정 403, 남의 제안서 삭제 403), items 검증(없는 모델·옵션·품목 422), 페이지 조립(카테고리 순서, HCK/01M 택1, 초음파 브랜드당 1장, 치료장비 8줄 분할(합계 없음)), 치료장비 품목 CRUD·순서·사용 안 함, snapshot 보존(품목 수정 후 기존 제안서 그대로)
- 사진 처리: 흰 배경 PNG·JPG·HEIC 업로드 → 투명 PNG, 긴 변 ≤ 800px
- PDF: 전 장비 + 치료장비 28개를 고른 제안서로 A·C 각각 생성 → 페이지 수, A4 가로, 파일명
- 프론트: tsc / eslint / next build
- Playwright 실측: PC·폰(390px)에서 새 제안서 → 장비·치료장비 선택 → 미리보기 → 저장 → 목록 → 복사 → PDF, 품목 관리에서 사진 업로드·순서 변경

## 12. 구현 순서 (다음 단계에서 상세 계획 작성)
1. 백엔드: 카탈로그 · 모델 2개 · 마이그레이션(초기 품목 포함) · CRUD API · 사진 처리 · 테스트
2. 렌더링: A·C 템플릿(치료장비 표 포함), 폰트·사진, 미리보기 HTML, Playwright PDF, Docker 변경
3. 프론트: 사이드바, 목록, 작성 화면(PC·폰), 미리보기, 치료장비 품목 관리
4. 검증 후 배포(서버 디스크 확인 → 이미지 빌드 → 마이그레이션)
