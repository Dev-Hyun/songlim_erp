# 제안서 제작 (개원의 제안서) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 장비를 클릭으로 고르고 금액을 넣으면 A/C 디자인의 견적 제안서 PDF가 나오고, 제안서를 저장·복사·재출력할 수 있게 한다. 치료장비 품목은 관리 화면에서 수정한다.

**Architecture:** 백엔드(FastAPI)에 `app/proposal/` 패키지를 두고 카탈로그(코드) → 페이지 조립(순수 함수) → Jinja2 HTML 렌더 → Playwright(Chromium) PDF 순으로 흐른다. 미리보기와 PDF는 같은 HTML을 쓴다. 프론트(Next.js)는 목록·작성·품목관리 화면을 만들고 미리보기는 iframe `srcdoc`로 서버 HTML을 그대로 보여준다.

**Tech Stack:** FastAPI · SQLAlchemy(async, SQLite) · Alembic · Jinja2 · Playwright for Python · Pillow · Next.js 16 / React 19 / Tailwind 4

**Spec:** `docs/superpowers/specs/2026-11-07-proposal-builder-design.md`
**디자인 원본:** `보고서/제안서_디자인초안/index.html` (A·C 템플릿과 CSS의 출처, 사진 `img/`)

## Global Constraints

- 모든 API는 `require_staff`(송림 직원). 삭제는 작성자 또는 `is_admin`.
- 페이지 크기 1123 × 794px = A4 가로, PDF `width="297mm", height="210mm", print_background=True`.
- 디자인 값은 `A` | `C`, 기본 `A`.
- 금액은 정수(원)로 저장, 표시는 천 단위 쉼표 + `원`(치료장비 표는 `₩` 접두).
- 강조 문법: 문구 안 `**…**` → `<b class="hl">…</b>`. 다른 HTML은 이스케이프.
- 치료장비: 8줄/페이지, **합계 줄 없음**, 수량 ≥ 2는 강조.
- 전동테이블: 가격 입력 없음, 항상 "C-arm 견적에 포함".
- PDF 파일명: `{제안일}_제안서_{병원명} {원장님}원장님.pdf`.
- 사진 업로드: 이미지만, 10MB 이하, 흰/밝은 배경 제거 + 여백 자르기 + 긴 변 ≤ 800px PNG.
- 기존 코드 스타일·주석 언어(한국어) 유지. medioc.com 데이터 사용 금지.

---

## File Structure

```
backend/
  requirements.txt                      + Jinja2, playwright
  Dockerfile                            + playwright chromium, fonts-noto-cjk
  app/models/proposal.py                Proposal, ProposalTherapyItem
  app/models/__init__.py                export 2 models
  alembic/versions/a7c2e9f1b3d4_proposals.py   테이블 2개 + 초기 치료장비 28개
  app/proposal/__init__.py
  app/proposal/catalog.py               주요 장비 카탈로그(문구·사진·옵션) + 치료장비 초기 품목
  app/proposal/schemas.py               items JSON Pydantic 검증
  app/proposal/pages.py                 items → 페이지 목록(순수 함수)
  app/proposal/render.py                Jinja2 렌더(hl 필터, 자산 URL)
  app/proposal/pdf.py                   Playwright 브라우저 재사용 + 세마포어
  app/proposal/therapy_image.py         업로드 사진 배경 제거·리사이즈(Pillow)
  app/proposal/templates/base.html      공통 head/CSS/이미지 맞춤 스크립트
  app/proposal/templates/a.html         A 디자인 페이지 매크로
  app/proposal/templates/c.html         C 디자인 페이지 매크로
  app/proposal/static/img/...           주요 장비 사진(디자인초안 img 복사)
  app/proposal/static/therapy/NN.png    치료장비 초기 사진 28장
  app/routers/proposals.py              API 전체
  app/main.py                           include_router
  tests/test_proposal_pages.py          카탈로그·검증·페이지 조립
  tests/test_proposal_therapy.py        품목 CRUD·순서·사진 처리
  tests/test_proposals_api.py           제안서 CRUD·복사·권한·스냅샷·미리보기·PDF
frontend/src/
  layout/AppSidebar.tsx                 "제안서 제작" 그룹
  app/(admin)/proposals/page.tsx        목록
  app/(admin)/proposals/new/page.tsx    새로 만들기
  app/(admin)/proposals/[id]/page.tsx   수정
  app/(admin)/proposals/therapy-items/page.tsx  품목 관리
  components/proposals/api.ts           fetch 래퍼
  components/proposals/types.ts         타입
  components/proposals/ProposalListClient.tsx
  components/proposals/ProposalEditor.tsx       기본정보·디자인·카테고리 패널·미리보기·저장/PDF
  components/proposals/CategoryPanels.tsx       카테고리별 입력 UI
  components/proposals/MoneyInput.tsx           쉼표 자동 숫자 입력
  components/proposals/TherapyItemsClient.tsx   품목 관리(표/카드, 시트 편집, 드래그 정렬, 사진 업로드)
```

---

### Task 1: 모델 · 마이그레이션 · 카탈로그 · 검증 · 페이지 조립

**Files:** Create `app/models/proposal.py`, `app/proposal/{__init__,catalog,schemas,pages}.py`, `alembic/versions/a7c2e9f1b3d4_proposals.py`, `app/proposal/static/{img,therapy}/*`; Modify `app/models/__init__.py`, `requirements.txt`; Test `tests/test_proposal_pages.py`

**Interfaces (Produces):**
- `Proposal(id, kind='clinic', hospital_name, doctor_name, proposal_date, rep_name, rep_title, rep_phone, design, items: str(JSON), author_id, copied_from_id, created_at, updated_at)`
- `ProposalTherapyItem(id, name, maker, model, note, warranty, image_key, sort_order, is_active, created_at, updated_at)`; `image_key`는 `seed/NN.png`(정적) 또는 `up/<hex>.png`(업로드)
- `catalog.XRAY_MODELS: dict[str, dict]`, `MAMMO_MODELS`, `CARM_MODELS`, `BMD_MODELS`, `US_BRANDS: dict[brand, {models: dict}]`, `XRAY_OPTIONS: dict[key,label]`, `PACS`, `CARM_TABLES: {"HCK":…, "01M":…}`, `SELD`, `THERAPY_SEED: list[dict]`, `catalog_for_client() -> dict`
- `schemas.ProposalItems` (Pydantic) — 필드: `xray: list[XrayItem]`, `pacs: PriceOnly|None`, `mammo|carm|bmd: list[ModelPrice]`, `carm_table: Literal["HCK","01M"]|None`, `carm_reducer: PriceOnly|None`, `ultrasound: list[UsBrand]`, `therapy: list[TherapyLine]`; `validate_items(items) -> list[str]`(카탈로그 위반 메시지)
- `schemas.ProposalIn` (hospital_name, doctor_name, proposal_date, rep_*, design, items)
- `pages.build_pages(p: dict, items: ProposalItems, therapy_rows: list[dict]) -> list[dict]` — 각 dict `{"kind": "cover|intro|eq|pacs|hck|x3c|seld|us|rx|why|thx", ...}`, 순서 = 스펙 3절

- [ ] 1. `requirements.txt`에 `Jinja2==3.1.6`, `playwright==1.56.0` 추가, venv에 설치
- [ ] 2. 실패 테스트 작성: 카테고리 순서(X-RAY→PACS→MAMMO→C-ARM 모델→테이블→저감장치→BMD→US→치료장비), HCK/01M 택1, 초음파 브랜드당 1장·모델 1~4, 치료장비 17줄 → 3장(8/8/1)·합계 없음, E40S/SD Include 자동 문구, 없는 모델·옵션 → validate_items 오류
- [ ] 3. 구현(catalog 문구는 디자인초안 ITEMS 데이터에서 그대로 옮김), 테스트 통과
- [ ] 4. 모델 + 마이그레이션(down_revision `f3b6c9d2a5e8`, 초기 품목 28개 insert), `alembic upgrade head` 로컬 확인
- [ ] 5. 디자인초안 `img/` → `app/proposal/static/img/`, `img/rx/NN.png` → `static/therapy/NN.png` 복사
- [ ] 6. Commit `feat(proposal): 모델·카탈로그·페이지 조립`

### Task 2: 렌더링 (Jinja2 A·C 템플릿) + 미리보기 HTML

**Files:** Create `app/proposal/render.py`, `templates/{base,a,c}.html`; Test `tests/test_proposal_pages.py`(렌더 케이스 추가)

**Interfaces:**
- Consumes: `pages.build_pages`
- Produces: `render.render_html(proposal: dict, pages: list[dict], *, asset_base: str) -> str` — `asset_base`는 미리보기 `"{API}/api/proposals/static/"`, PDF는 `Path(static).as_uri()+"/"`; 업로드 사진은 `therapy_url(key, asset_base, upload_base)`로 해석; Jinja 필터 `hl`(이스케이프 후 `**x**`→강조), `won`(쉼표+원), `krw`(₩+쉼표)

- [ ] 1. 실패 테스트: A·C 렌더 결과에 `class="sheet dA"`/`dC` 개수 = 페이지 수, 병원명·원장님·담당자 포함, `<b class="hl">2EA</b>` 존재, `<script>` 주입 문자열이 이스케이프됨, 치료장비 페이지에 `tfoot` 없음
- [ ] 2. 디자인초안의 CSS·템플릿 함수(A/C 객체)를 Jinja 매크로로 옮김. 이미지 맞춤 스크립트(`fitImg`, AREA 0.44)는 base.html에 그대로
- [ ] 3. 테스트 통과 → Commit `feat(proposal): A·C 템플릿 렌더링`

### Task 3: 치료장비 품목 API + 사진 처리

**Files:** Create `app/proposal/therapy_image.py`, `app/routers/proposals.py`(품목 부분); Modify `app/main.py`; Test `tests/test_proposal_therapy.py`

**Interfaces (Produces):**
- `therapy_image.process(data: bytes, ext: str) -> bytes` (PNG) — `optimize_image`의 HEIC 처리 재사용, 1px 흰 패딩 후 (0,0)에서 `ImageDraw.floodfill`(thresh)로 배경 연결영역 투명화 → bbox 자르기 → 긴 변 800
- `GET /api/proposals/therapy-items?include_inactive=1`, `POST`, `PUT /{id}`, `POST /reorder {ids}`, `POST /{id}/image`(multipart), `GET /api/proposals/therapy-image/{key}`(공개), `GET /api/proposals/static/{path}`(공개)

- [ ] 1. 실패 테스트: 생성·수정·사용안함 숨김·순서변경, 흰 배경 PNG 업로드 → 모서리 alpha 0·긴 변 ≤ 800, 이미지 아닌 파일 422, 병원 계정 403
- [ ] 2. 구현 → 통과 → Commit `feat(proposal): 치료장비 품목 관리 API`

### Task 4: 제안서 CRUD · 복사 · 카탈로그 · 미리보기 · PDF

**Files:** Create `app/proposal/pdf.py`; Modify `app/routers/proposals.py`, `Dockerfile`; Test `tests/test_proposals_api.py`

**Interfaces (Produces):**
- `GET /api/proposals?q=`, `POST /api/proposals`, `GET|PUT|DELETE /api/proposals/{id}`, `POST /api/proposals/{id}/copy`, `GET /api/proposals/catalog`, `POST /api/proposals/preview`(ProposalIn → text/html), `GET /api/proposals/{id}/pdf`
- 저장 시 `therapy[].snapshot` 채움(품목 테이블에서), 복사 시 최신 품목으로 다시 채움, 제안일 = 오늘
- `pdf.html_to_pdf(html: str) -> bytes` — 앱 수명 동안 브라우저 1개, `asyncio.Semaphore(2)`, 30초 타임아웃, 실패 시 `PdfError`

- [ ] 1. 실패 테스트: CRUD, 목록 검색, 남의 것 삭제 403/관리자 허용, 복사(새 id·copied_from_id·오늘 날짜), 없는 모델 422, 스냅샷 보존(품목 수정 후 GET 결과 그대로), preview HTML 200·페이지 수, PDF는 playwright 설치 시에만(`pytest.importorskip` + 브라우저 실행 실패 시 skip) `%PDF` 시작·Content-Disposition 파일명
- [ ] 2. 구현, Dockerfile에 `RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk && playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*`
- [ ] 3. 전체 pytest 통과 → Commit `feat(proposal): 제안서 API·미리보기·PDF`

### Task 5: 프론트 — 사이드바 · 목록 · 작성/수정 · 미리보기

**Files:** Create `components/proposals/{api,types}.ts`, `ProposalListClient.tsx`, `ProposalEditor.tsx`, `CategoryPanels.tsx`, `MoneyInput.tsx`, pages `/proposals`, `/proposals/new`, `/proposals/[id]`; Modify `layout/AppSidebar.tsx`

- [ ] 1. 사이드바: "자료실" 위에 `{ icon: <DocsIcon/>, name: "제안서 제작", subItems: [{name:"개원의 제안서 제작", path:"/proposals"}, {name:"치료장비 품목 관리", path:"/proposals/therapy-items"}] }`
- [ ] 2. 목록: 검색, 행 동작(열기·복사·PDF·삭제 확인), 폰 카드
- [ ] 3. 편집기: 기본정보(담당자 기본값=로그인 사용자 display_name), 디자인 토글, 카테고리 6개 패널, `MoneyInput`, 0.6초 디바운스 미리보기(iframe srcdoc, 1123px 기준 축소), 하단 고정 [저장][PDF], 필수값 표시, 폰은 [입력|미리보기] 탭
- [ ] 4. `npx tsc --noEmit`, `npx eslint`, `npm run build` 통과 → Commit `feat(proposal): 제안서 목록·작성 화면`

### Task 6: 프론트 — 치료장비 품목 관리

**Files:** Create `components/proposals/TherapyItemsClient.tsx`, page `/proposals/therapy-items`

- [ ] 1. 표(PC)/카드(폰), 추가·수정 시트(품명·제조사·모델·비고·Warranty·사용 여부), 사진 업로드(처리 결과 즉시 표시), 드래그 정렬(재고관리와 같은 포인터 이벤트 방식)
- [ ] 2. tsc/eslint/build 통과 → Commit `feat(proposal): 치료장비 품목 관리 화면`

### Task 7: 실측 검증 · 기록 · 커밋/푸시

- [ ] 1. 로컬 백엔드+프론트 실행, Playwright로 PC·폰(390px): 새 제안서 → 장비·치료장비 선택 → 미리보기 → 저장 → 목록 → 복사 → PDF 다운로드(페이지 수·A4 확인), 품목 사진 업로드·순서 변경
- [ ] 2. 검증용 데이터 정리
- [ ] 3. `/checkpoint`로 PROGRESS.md·메모리 갱신 후 커밋·푸시 (서버 배포는 하지 않음 — 디스크 확인 후 별도)
