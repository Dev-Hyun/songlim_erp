#!/usr/bin/env bash
# NCP 서버 배포 — 코드 갱신 + 컨테이너 재빌드.
#
# DB는 건드리지 않는다. backend/data.db 는 서버에서 bind-mount 되는 운영 데이터이고
# 영업노트·계약·재고·계정이 같은 파일에 들어 있어, 로컬 DB를 올려 덮어쓰면 그것들이 사라진다.
# 데이터 정정은 서버에서 scripts/apply_audit_fixes.py 를 직접 돌린다(--data-fixes 참고).
#
# 사용법:
#   bash tools/deploy.sh              # git pull + 재빌드
#   bash tools/deploy.sh --data-fixes # 위 + 서버 DB 백업 후 데이터 정정 dry-run
#   bash tools/deploy.sh --data-fixes --apply   # 정정까지 반영
set -euo pipefail

HOST="root@101.79.25.182"
KEY="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/NCP/songlim_deploy_key"
# 서버의 앱 디렉터리. 다르면 SONGLIM_APP_DIR 로 넘긴다.
APP_DIR="${SONGLIM_APP_DIR:-/root/songlim_erp}"

DATA_FIXES=0
APPLY=0
ONLY=""
SYNC_ENV=""
DB_REPORT=0
RUN_IMPORT=""
IMPORT_LOG=""
for a in "$@"; do
  case "$a" in
    --data-fixes) DATA_FIXES=1 ;;
    --apply)      APPLY=1 ;;
    # 병원 정정(R2/R4/R5)은 심평원 API가 필요하다. 서버 .env 에 HIRA_API_KEY 가 없으면
    # --only dupes --only license --only manufacturer 로 DB만 쓰는 항목을 돌린다.
    --only=*)     ONLY="$ONLY --only ${a#--only=}" ;;
    --sync-env=*) SYNC_ENV="$SYNC_ENV ${a#--sync-env=}" ;;
    --db-report)  DB_REPORT=1 ;;
    --run-import=*) RUN_IMPORT="${a#--run-import=}" ;;
    --import-log=*) IMPORT_LOG="${a#--import-log=}" ;;
    *) echo "모르는 옵션: $a" >&2; exit 2 ;;
  esac
done

ssh_run() { ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$HOST" "$@"; }

if ! ssh_run "test -f $APP_DIR/docker-compose.yml" 2>/dev/null; then
  # 기본 경로에 없으면 몇 군데만 확인한다. 전체 탐색은 하지 않는다.
  # 돌고 있는 컨테이너에게 묻는다 — compose 가 프로젝트 경로를 라벨에 남긴다.
  # 경로를 추측하는 것보다 정확하고, 읽기 한 번으로 끝난다.
  APP_DIR="$(ssh_run "docker ps --filter label=com.docker.compose.project \
      --format '{{.Label \"com.docker.compose.project.working_dir\"}}' | head -1" || true)"
  if [ -z "$APP_DIR" ]; then
    echo "서버에서 docker-compose.yml 을 찾지 못했습니다." >&2
    echo "경로를 알면: SONGLIM_APP_DIR=/실제/경로 bash tools/deploy.sh" >&2
    exit 1
  fi
fi
echo "앱 디렉터리: $APP_DIR"

# --sync-env=KEY : 로컬 backend/.env 의 그 키를 서버 backend/.env 로 옮긴다.
# 값은 stdin 으로만 보낸다 — argv 에 실으면 서버 프로세스 목록과 셸 히스토리에 남는다.
if [ -n "$SYNC_ENV" ]; then
  LOCAL_ENV="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backend/.env"
  for k in $SYNC_ENV; do
    line="$(grep -m1 "^$k=" "$LOCAL_ENV" || true)"
    if [ -z "$line" ] || [ "$line" = "$k=" ]; then
      echo "로컬 .env 에 $k 값이 없습니다 — 건너뜀" >&2
      continue
    fi
    printf '%s
' "$line" | ssh_run "cd $APP_DIR && f=backend/.env && touch \$f &&       grep -v '^$k=' \$f > \$f.tmp; cat >> \$f.tmp && mv \$f.tmp \$f && chmod 600 \$f"
    echo "서버 .env 에 $k 등록 완료"
  done
  echo "== 백엔드 재기동 (.env 반영) =="
  ssh_run "cd $APP_DIR && docker compose up -d backend"
fi

# --db-report : 서버 DB 의 테이블별 행수만 읽어서 보여준다 (읽기 전용, 아무것도 바꾸지 않는다).
# 로컬과 서버 중 어느 쪽에 어떤 데이터가 있는지 확인하는 용도.
if [ "$DB_REPORT" = 1 ]; then
  ssh_run "cd $APP_DIR && docker compose exec -T backend python - <<'PY'
import sqlite3
c = sqlite3.connect('file:/app/data.db?mode=ro', uri=True)
rows = [r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY 1\")]
print('서버 테이블', len(rows))
for n in rows:
    try:
        print('  %-34s %10d' % (n, c.execute('SELECT COUNT(*) FROM [%s]' % n).fetchone()[0]))
    except Exception as e:
        print('  %-34s ERR %s' % (n, e))
q = lambda s: c.execute(s).fetchall()
print()
print('== equipment source 별 (created_by 는 직원이 직접 등록한 건) ==')
for r in q('SELECT source, COUNT(*), SUM(created_by IS NOT NULL) FROM equipment GROUP BY 1 ORDER BY 2 DESC'):
    print('  %-14s %9d  created_by %s' % r)
print('== 참조 무결성 ==')
print('  hospital_profile_id 연결   ', q('SELECT COUNT(*) FROM hospitals WHERE hospital_profile_id IS NOT NULL')[0][0])
print('  sales_notes 가 쓰는 병원   ', q('SELECT COUNT(DISTINCT hospital_id) FROM sales_notes')[0][0])
print('  hospitals id 최대          ', q('SELECT MAX(id) FROM hospitals')[0][0])
print('  equipment hospital_id 범위 ', q('SELECT MIN(hospital_id), MAX(hospital_id) FROM equipment')[0])
print('  고아 장비                  ', q('SELECT COUNT(*) FROM equipment e LEFT JOIN hospitals h ON h.id=e.hospital_id WHERE h.id IS NULL')[0][0])
print('  alembic                    ', q('SELECT version_num FROM alembic_version')[0][0])
PY"
  exit 0
fi

# --run-import=NAME : 공공데이터 임포트를 서버에서 **분리 실행**한다.
#   수십만~백만 행을 API 로 받느라 SSH 세션보다 오래 살아야 해서 nohup 으로 띄우고 로그만 본다.
#   임의 스크립트 실행 통로가 되지 않게 이름을 아래 5종으로 한정한다.
# --import-log=NAME : 그 로그 확인.
case "$RUN_IMPORT" in
  ""|mfds|localdata|hospitals|odcloud|manufacturer) ;;
  *) echo "모르는 임포트: $RUN_IMPORT (mfds|localdata|hospitals|odcloud|manufacturer)" >&2; exit 2 ;;
esac

if [ -n "$IMPORT_LOG" ]; then
  ssh_run "tail -c 1500 /var/log/songlim_import_$IMPORT_LOG.log 2>/dev/null | tr '\r' '\n' | tail -12 || echo '(로그 없음)'"
  exit 0
fi

if [ -n "$RUN_IMPORT" ]; then
  case "$RUN_IMPORT" in
    mfds)         SCRIPT="sync_mfds_device_makers.py --apply" ;;
    localdata)    SCRIPT="sync_localdata_clinics.py --apply" ;;
    hospitals)    SCRIPT="sync_hira_hospital_info.py --apply" ;;
    odcloud)      SCRIPT="import_odcloud_equipment_years.py --apply --years 2023,2024,2025" ;;
    manufacturer) SCRIPT="assign_equipment_manufacturer.py --apply" ;;
  esac
  echo "== 서버 DB 백업 =="
  ssh_run "cd $APP_DIR && cp backend/data.db backend/data.db.bak_before_${RUN_IMPORT}_\$(date +%Y%m%d_%H%M%S) && ls -la backend/data.db.bak_before_${RUN_IMPORT}_* | tail -1"
  echo "== $RUN_IMPORT 시작 (분리 실행) =="
  ssh_run "cd $APP_DIR && setsid nohup docker compose exec -T backend python scripts/$SCRIPT > /var/log/songlim_import_$RUN_IMPORT.log 2>&1 < /dev/null & sleep 6; echo started"
  echo "진행 확인: bash tools/deploy.sh --import-log=$RUN_IMPORT"
  exit 0
fi

echo "== 1. 코드 갱신 =="
ssh_run "cd $APP_DIR && git pull --ff-only"

echo "== 2. 컨테이너 재빌드 =="
ssh_run "cd $APP_DIR && docker compose up -d --build"

if [ "$DATA_FIXES" = 1 ]; then
  if [ "$APPLY" = 1 ]; then
    echo "== 3. 서버 DB 백업 =="
    ssh_run "cd $APP_DIR && cp backend/data.db backend/data.db.bak_before_audit_fixes_\$(date +%Y%m%d_%H%M%S)"
    echo "== 4. 데이터 정정 반영 =="
    ssh_run "cd $APP_DIR && docker compose exec -T backend python scripts/apply_audit_fixes.py --apply$ONLY"
  else
    echo "== 3. 데이터 정정 dry-run (반영하려면 --apply) =="
    ssh_run "cd $APP_DIR && docker compose exec -T backend python scripts/apply_audit_fixes.py$ONLY"
  fi
fi

echo "== 상태 확인 =="
ssh_run "cd $APP_DIR && docker compose ps --format '{{.Service}}\t{{.Status}}'"
echo "배포 완료."
