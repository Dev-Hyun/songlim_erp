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
for a in "$@"; do
  case "$a" in
    --data-fixes) DATA_FIXES=1 ;;
    --apply)      APPLY=1 ;;
    # 병원 정정(R2/R4/R5)은 심평원 API가 필요하다. 서버 .env 에 HIRA_API_KEY 가 없으면
    # --only dupes --only license --only manufacturer 로 DB만 쓰는 항목을 돌린다.
    --only=*)     ONLY="$ONLY --only ${a#--only=}" ;;
    --sync-env=*) SYNC_ENV="$SYNC_ENV ${a#--sync-env=}" ;;
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
