"""SQLite DB 자동 백업 — 매일 cron으로 실행.

1. backend/data.db를 backend/backups/data_YYYYMMDD_HHMMSS.db로 스냅샷
2. 로컬 보관은 최근 KEEP_COUNT개만 남기고 오래된 것 삭제(로테이션)

   왜 '일수'가 아니라 '개수'인가: 원래 KEEP_DAYS=14였는데, data.db가 92MB에서 1.2GB로
   커지자 14일치가 16.8GB가 되어 20GB 디스크를 꽉 채웠다(2026-09-24 백업이
   "database or disk is full"로 실패하고, 그 뒤 서버의 모든 쓰기가 멈췄다).
   개수 기준이면 DB가 커져도 로컬 사용량이 KEEP_COUNT배로 묶인다.
   전체 이력은 어차피 S3에 있으므로 로컬은 빠른 복구용 몇 개면 충분하다.
3. NCP_OBJECT_STORAGE_* 환경변수가 설정돼 있으면(이미 클라우드 NAS에서 쓰는 것과 동일 버킷)
   backups/ 프리픽스로 같은 파일을 업로드 — 서버 자체가 사라져도 원격에 남아있게 함

sqlite3의 backup API를 써서 서비스 중인 DB를 잠그지 않고 안전하게 복사한다(단순 파일 cp는
쓰기 도중 스냅샷을 뜰 위험이 있음).
"""
import glob
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timezone

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BACKEND_DIR, "data.db")
BACKUP_DIR = os.path.join(BACKEND_DIR, "backups")
KEEP_COUNT = 3          # 로컬에 남길 백업 개수 (전체 이력은 S3)
FREE_MARGIN = 1.3       # 스냅샷에 DB 크기의 몇 배만큼 여유를 요구할지


def _load_env():
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(BACKEND_DIR, ".env"))
    except ImportError:
        pass


def _backups_newest_first() -> list:
    return sorted(glob.glob(os.path.join(BACKUP_DIR, "data_*.db")), key=os.path.getmtime, reverse=True)


def snapshot() -> str:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dest_path = os.path.join(BACKUP_DIR, f"data_{ts}.db")
    src = sqlite3.connect(DB_PATH)
    dest = sqlite3.connect(dest_path)
    try:
        with dest:
            src.backup(dest)
    except Exception:
        # 디스크가 모자라 실패하면 반쯤 쓰인 파일이 그대로 남아 공간을 계속 먹는다.
        # 2026-09-24에 1.07GB짜리 빈 껍데기(테이블도 없는)가 남아 있었다. 반드시 치운다.
        src.close()
        dest.close()
        for leftover in (dest_path, dest_path + "-journal", dest_path + "-wal", dest_path + "-shm"):
            if os.path.exists(leftover):
                os.remove(leftover)
        raise
    src.close()
    dest.close()
    return dest_path


def rotate(keep: int = KEEP_COUNT):
    """최근 keep개만 남기고 오래된 로컬 백업 삭제. 날짜가 아니라 개수 기준이라
    DB가 커져도 로컬 사용량이 정해진 배수를 넘지 않는다."""
    if not os.path.isdir(BACKUP_DIR):
        return
    for path in _backups_newest_first()[keep:]:
        os.remove(path)
        print(f"오래된 로컬 백업 삭제: {os.path.basename(path)}")
    # 실패한 백업이 남긴 저널 조각도 치운다
    for junk in glob.glob(os.path.join(BACKUP_DIR, "data_*.db-journal")):
        if not os.path.exists(junk[: -len("-journal")]):
            os.remove(junk)


def ensure_space():
    """스냅샷을 뜰 공간이 없으면 가장 오래된 백업부터 더 지운다(최소 1개는 남긴다).
    그래도 부족하면 반쯤 쓴 파일을 만들지 말고 명확히 실패시킨다."""
    need = int(os.path.getsize(DB_PATH) * FREE_MARGIN)
    while shutil.disk_usage(BACKUP_DIR).free < need:
        files = _backups_newest_first()
        if len(files) <= 1:
            raise RuntimeError(
                f"디스크 여유가 부족합니다(필요 {need // 1048576}MB, "
                f"여유 {shutil.disk_usage(BACKUP_DIR).free // 1048576}MB). "
                "백업을 더 지워도 확보되지 않아 중단합니다 — 서버 디스크를 확인하세요."
            )
        oldest = files[-1]
        os.remove(oldest)
        print(f"공간 확보를 위해 삭제: {os.path.basename(oldest)}")


def upload_to_object_storage(local_path: str):
    endpoint = os.environ.get("NCP_OBJECT_STORAGE_ENDPOINT", "")
    access_key = os.environ.get("NCP_OBJECT_STORAGE_ACCESS_KEY", "")
    secret_key = os.environ.get("NCP_OBJECT_STORAGE_SECRET_KEY", "")
    bucket = os.environ.get("NCP_OBJECT_STORAGE_BUCKET", "")
    if not (endpoint and access_key and secret_key and bucket):
        print("NCP_OBJECT_STORAGE_* 미설정, 원격 업로드 건너뜀 (로컬 백업만 수행)")
        return
    import boto3
    client = boto3.client("s3", endpoint_url=endpoint, aws_access_key_id=access_key, aws_secret_access_key=secret_key)
    key = f"backups/{os.path.basename(local_path)}"
    # data.db가 1GB를 넘어가므로 f.read()로 전체를 메모리에 올리지 않고 스트리밍으로 업로드한다.
    with open(local_path, "rb") as f:
        client.upload_fileobj(f, bucket, key)
    print(f"업로드 완료: s3://{bucket}/{key}")


def main():
    _load_env()
    if not os.path.exists(DB_PATH):
        print(f"DB 파일이 없습니다: {DB_PATH}", file=sys.stderr)
        sys.exit(1)
    # 순서가 중요하다: 예전에는 snapshot()을 먼저 해서, 로테이션으로 비울 수 있는 공간이
    # 있는데도 "disk is full"로 실패했다. 지우고 나서 뜬다.
    rotate()
    ensure_space()
    path = snapshot()
    print(f"스냅샷 생성: {path}")
    upload_to_object_storage(path)


if __name__ == "__main__":
    main()
