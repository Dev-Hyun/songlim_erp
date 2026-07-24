# SONGLIM ERP

송림메디칼 사내 ERP — 의료장비/소모품 B2B 영업·발주·계약 관리 시스템.
송림 직원용 영업/계약/재고/캘린더 관리와, 거래 병원용 소모품 발주 포털을 하나의 앱에서 제공합니다.

## 스택

| 영역 | 기술 |
|---|---|
| 프론트엔드 | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS |
| 백엔드 | FastAPI, SQLAlchemy 2.0 (async), Alembic, aiosqlite |
| DB | SQLite (파일 기반, `backend/data.db`) |
| 배포 | Docker Compose (backend :8010 / frontend :3000), NCP(Naver Cloud Platform) 서버 |
| 외부 연동 | 네이버 지도, 네이버 뉴스 검색, 나라장터(G2B) 입찰정보, Google Calendar OAuth, Cloudflare R2, 네이버 클로바 OCR |

## 주요 기능

**송림 직원**
- 영업지도(병원 위치·통계), 계약 진행 현황(등록~완료 4단계), 초음파 납품/재고 관리
- 캘린더(팀 공유, 전체 공유, 멤버 초대), 사내 공지사항/커뮤니티/건의사항
- 소모품 카탈로그 관리(카테고리별 정렬, 병원종별 노출 제한, 병원별 전용 단가), 발주 관리
- 계약서 사진 OCR 자동입력(네이버 클로바 OCR)
- CS 접수/답변, 병원 계정 관리, 클라우드 NAS(사내 공유 파일)

**거래 병원**
- 소모품 발주(카테고리·검색·즐겨찾기, 장바구니, 요청사항 입력), 발주 내역 조회/재주문
- 병원 공지사항/의료소식/공동구매/중고기기 게시판, CS 문의

## 로컬 개발 환경 실행

### 사전 준비
- Python 3.12+, Node.js 20+
- `backend/.env.example`을 복사해 `backend/.env` 생성 후 필요한 키 채우기
  (지도/뉴스/구글캘린더/클로바OCR 등은 선택 — 없어도 핵심 기능은 동작)

### 백엔드

```bash
cd backend
python -m venv venv
./venv/Scripts/activate   # Windows: venv\Scripts\activate / macOS·Linux: source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8010
```

### 프론트엔드

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

`frontend/.env.local`에 `NEXT_PUBLIC_API_URL=http://localhost:8010` 설정 필요.

## Docker Compose로 실행 (배포와 동일한 방식)

```bash
docker compose up -d --build
```

- 백엔드: `http://localhost:8010` (컨테이너 기동 시 `alembic upgrade head` 자동 실행)
- 프론트엔드: `http://localhost:3000`
- `backend/data.db`, `backend/uploads/`는 볼륨 마운트되어 컨테이너를 다시 만들어도 데이터가 유지됩니다.

## DB 마이그레이션

스키마 변경은 전부 Alembic으로 관리합니다.

```bash
cd backend
alembic revision -m "설명"      # 새 마이그레이션 생성
alembic upgrade head            # 적용
```

> `alembic.ini`의 `sqlalchemy.url`은 상대경로 SQLite 파일을 가리키므로, 어떤 `DB_PATH` 환경변수를
> 주더라도 `alembic` CLI는 항상 현재 작업 디렉터리의 `data.db`에 적용됩니다 (앱 실행 시 사용하는
> `DB_PATH`와는 별개).

## 프로젝트 구조

```
backend/
  app/
    models/         # SQLAlchemy 모델
    routers/        # FastAPI 라우터 (도메인별)
    main.py         # 앱 엔트리포인트
  alembic/versions/ # DB 마이그레이션
frontend/
  src/
    app/            # Next.js App Router 페이지
    components/     # 도메인별 UI 컴포넌트
    context/        # 인증 등 전역 상태
docker-compose.yml
```

## 로컬 전용 파일 (git에 올라가지 않음)

`.gitignore`에 등록되어 원격 저장소에는 절대 올라가지 않는 파일들입니다.

- `backend/.env`, `frontend/.env.local` — API 키/시크릿
- `NCP/` — 서버 접속키, 인프라 메모
- `PROGRESS.md` — 세션 간 개발 이력 기록
- `New.md` — 작업 요청사항 메모
