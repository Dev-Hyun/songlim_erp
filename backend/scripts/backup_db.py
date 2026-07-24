"""SQLite DB 자동 백업 — 매일 cron으로 실행.

1. backend/data.db를 backend/backups/data_YYYYMMDD_HHMMSS.db로 스냅샷
2. 로컬 보관은 최근 KEEP_DAYS일치만 남기고 오래된 것 삭제(로테이션)
3. NCP_OBJECT_STORAGE_* 환경변수가 설정돼 있으면(이미 클라우드 NAS에서 쓰는 것과 동일 버킷)
   backups/ 프리픽스로 같은 파일을 업로드 — 서버 자체가 사라져도 원격에 남아있게 함

sqlite3의 backup API를 써서 서비스 중인 DB를 잠그지 않고 안전하게 복사한다(단순 파일 cp는
쓰기 도중 스냅샷을 뜰 위험이 있음).
"""
import os
import sqlite3
import sys
from datetime import datetime, timezone

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BACKEND_DIR, "data.db")
BACKUP_DIR = os.path.join(BACKEND_DIR, "backups")
KEEP_DAYS = 14


def _load_env():
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(BACKEND_DIR, ".env"))
    except ImportError:
        pass


def snapshot() -> str:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dest_path = os.path.join(BACKUP_DIR, f"data_{ts}.db")
    src = sqlite3.connect(DB_PATH)
    dest = sqlite3.connect(dest_path)
    with dest:
        src.backup(dest)
    src.close()
    dest.close()
    return dest_path


def rotate():
    if not os.path.isdir(BACKUP_DIR):
        return
    cutoff = datetime.now(timezone.utc).timestamp() - KEEP_DAYS * 86400
    for name in os.listdir(BACKUP_DIR):
        path = os.path.join(BACKUP_DIR, name)
        if os.path.isfile(path) and os.path.getmtime(path) < cutoff:
            os.remove(path)


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
    with open(local_path, "rb") as f:
        client.put_object(Bucket=bucket, Key=key, Body=f.read())
    print(f"업로드 완료: s3://{bucket}/{key}")


def main():
    _load_env()
    if not os.path.exists(DB_PATH):
        print(f"DB 파일이 없습니다: {DB_PATH}", file=sys.stderr)
        sys.exit(1)
    path = snapshot()
    print(f"스냅샷 생성: {path}")
    rotate()
    upload_to_object_storage(path)


if __name__ == "__main__":
    main()
