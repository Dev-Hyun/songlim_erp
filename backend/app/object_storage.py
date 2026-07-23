"""NCP Object Storage(S3 호환 API) 연동. 환경변수가 설정되지 않은 로컬 개발 환경에서는
자동으로 로컬 디스크(uploads/storage)에 저장하는 폴백을 사용한다."""
import asyncio
import os
from typing import Optional

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL_DIR = os.path.join(BACKEND_DIR, "uploads", "storage")

NCP_ENDPOINT = os.environ.get("NCP_OBJECT_STORAGE_ENDPOINT", "")
NCP_ACCESS_KEY = os.environ.get("NCP_OBJECT_STORAGE_ACCESS_KEY", "")
NCP_SECRET_KEY = os.environ.get("NCP_OBJECT_STORAGE_SECRET_KEY", "")
NCP_BUCKET = os.environ.get("NCP_OBJECT_STORAGE_BUCKET", "")

ENABLED = bool(NCP_ENDPOINT and NCP_ACCESS_KEY and NCP_SECRET_KEY and NCP_BUCKET)

_client = None


def _get_client():
    global _client
    if _client is None:
        import boto3
        _client = boto3.client(
            "s3",
            endpoint_url=NCP_ENDPOINT,
            aws_access_key_id=NCP_ACCESS_KEY,
            aws_secret_access_key=NCP_SECRET_KEY,
        )
    return _client


def _local_path(key: str) -> str:
    os.makedirs(LOCAL_DIR, exist_ok=True)
    return os.path.join(LOCAL_DIR, key)


async def put_object(key: str, data: bytes) -> None:
    if ENABLED:
        await asyncio.to_thread(_get_client().put_object, Bucket=NCP_BUCKET, Key=key, Body=data)
    else:
        with open(_local_path(key), "wb") as f:
            f.write(data)


async def get_object(key: str) -> Optional[bytes]:
    if ENABLED:
        def _get():
            try:
                return _get_client().get_object(Bucket=NCP_BUCKET, Key=key)["Body"].read()
            except Exception:
                return None
        return await asyncio.to_thread(_get)
    path = _local_path(key)
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return f.read()


async def delete_object(key: str) -> None:
    if ENABLED:
        await asyncio.to_thread(_get_client().delete_object, Bucket=NCP_BUCKET, Key=key)
    else:
        path = _local_path(key)
        if os.path.exists(path):
            os.remove(path)


async def copy_object(src_key: str, dest_key: str) -> None:
    if ENABLED:
        await asyncio.to_thread(
            _get_client().copy_object, Bucket=NCP_BUCKET, Key=dest_key, CopySource={"Bucket": NCP_BUCKET, "Key": src_key}
        )
    else:
        src = _local_path(src_key)
        if os.path.exists(src):
            with open(src, "rb") as sf, open(_local_path(dest_key), "wb") as df:
                df.write(sf.read())
