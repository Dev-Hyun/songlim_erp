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
for a in "$@"; do
  case "$a" in
    --data-fixes) DATA_FIXES=1 ;;
    --apply)      APPLY=1 ;;
    *) echo "모르는 옵션: $a" >&2; exit 2 ;;
  esac
done

ssh_run() { ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$HOST" "$@"; }

if ! ssh_run "test -f $APP_DIR/docker-compose.yml"; then
  echo "서버에 $APP_DIR/docker-compose.yml 이 없습니다." >&2
  echo "배포 경로가 다르면: SONGLIM_APP_DIR=/실제/경로 bash tools/deploy.sh" >&2
  exit 1
fi
echo "앱 디렉터리: $APP_DIR"

echo "== 1. 코드 갱신 =="
ssh_run "cd $APP_DIR && git pull --ff-only"

echo "== 2. 컨테이너 재빌드 =="
ssh_run "cd $APP_DIR && docker compose up -d --build"

if [ "$DATA_FIXES" = 1 ]; then
  if [ "$APPLY" = 1 ]; then
    echo "== 3. 서버 DB 백업 =="
    ssh_run "cd $APP_DIR && cp backend/data.db backend/data.db.bak_before_audit_fixes_\$(date +%Y%m%d_%H%M%S)"
    echo "== 4. 데이터 정정 반영 =="
    ssh_run "cd $APP_DIR && docker compose exec -T backend python scripts/apply_audit_fixes.py --apply"
  else
    echo "== 3. 데이터 정정 dry-run (반영하려면 --apply) =="
    ssh_run "cd $APP_DIR && docker compose exec -T backend python scripts/apply_audit_fixes.py"
  fi
fi

echo "== 상태 확인 =="
ssh_run "cd $APP_DIR && docker compose ps --format '{{.Service}}\t{{.Status}}'"
echo "배포 완료."
