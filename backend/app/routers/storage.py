import os
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import StaffProfile, StorageFile, StorageFolder, StorageFolderPermission, User
from app.routers.auth import require_staff

router = APIRouter(prefix="/api/storage", tags=["storage"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "storage")
ROOTS = ("nas", "templates")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_folder_or_404(db: AsyncSession, folder_id: int) -> StorageFolder:
    f = (await db.execute(select(StorageFolder).where(StorageFolder.id == folder_id))).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다")
    return f


async def _check_access(folder: Optional[StorageFolder], space: str, owner_id: Optional[int], user: User, db: AsyncSession, write: bool = False):
    """개인 클라우드는 본인/관리자만. 공유 클라우드는 폴더별 storage_folder_permissions로 직급 단위 제어
    (해당 직급 행이 없으면 기본 전체 공개 — 다른 게시판 권한 패턴과 동일)."""
    if space == "personal":
        if owner_id != user.id and not user.is_admin:
            raise HTTPException(status_code=403, detail="본인의 개인 클라우드만 접근할 수 있습니다")
        return
    if user.is_admin or folder is None:
        return
    staff = (await db.execute(select(StaffProfile).where(StaffProfile.user_id == user.id))).scalar_one_or_none()
    position = staff.position if staff else None
    perm = (
        await db.execute(
            select(StorageFolderPermission).where(
                StorageFolderPermission.folder_id == folder.id, StorageFolderPermission.position == position
            )
        )
    ).scalar_one_or_none()
    if perm and ((write and perm.permission_level != "edit") or (not write and perm.permission_level not in ("view", "edit"))):
        raise HTTPException(status_code=403, detail="이 폴더에 대한 권한이 없습니다")


async def _breadcrumb(db: AsyncSession, folder: Optional[StorageFolder]) -> list[dict]:
    trail = []
    cur = folder
    while cur is not None:
        trail.append({"id": cur.id, "name": cur.name})
        cur = (await db.execute(select(StorageFolder).where(StorageFolder.id == cur.parent_id))).scalar_one_or_none() if cur.parent_id else None
    trail.reverse()
    return trail


async def _is_descendant(db: AsyncSession, maybe_ancestor_id: int, folder_id: Optional[int]) -> bool:
    """folder_id(및 그 조상)에 maybe_ancestor_id가 포함되는지 — 자기 자신/자손 폴더로의 이동(순환) 방지용."""
    cur_id = folder_id
    while cur_id is not None:
        if cur_id == maybe_ancestor_id:
            return True
        cur = (await db.execute(select(StorageFolder).where(StorageFolder.id == cur_id))).scalar_one_or_none()
        cur_id = cur.parent_id if cur else None
    return False


@router.get("/browse")
async def browse(
    root: str = "nas",
    space: str = "shared",
    folder_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
):
    if root not in ROOTS:
        raise HTTPException(status_code=400, detail="잘못된 경로입니다")
    effective_owner = user.id if space == "personal" else None
    if space == "personal" and owner_id and user.is_admin:
        effective_owner = owner_id  # 관리자가 다른 직원의 개인 클라우드를 열람하는 경우

    folder = await _get_folder_or_404(db, folder_id) if folder_id else None
    await _check_access(folder, space, effective_owner, user, db, write=False)

    folders = (
        await db.execute(
            select(StorageFolder).where(
                StorageFolder.root == root, StorageFolder.space == space,
                StorageFolder.owner_id == effective_owner, StorageFolder.parent_id == folder_id,
            ).order_by(StorageFolder.name)
        )
    ).scalars().all()
    files = (
        await db.execute(
            select(StorageFile).where(
                StorageFile.root == root, StorageFile.space == space,
                StorageFile.owner_id == effective_owner, StorageFile.folder_id == folder_id,
            ).order_by(StorageFile.created_at.desc())
        )
    ).scalars().all()

    return {
        "breadcrumb": await _breadcrumb(db, folder),
        "folders": [{"id": f.id, "name": f.name, "created_at": f.created_at} for f in folders],
        "files": [
            {"id": f.id, "filename": f.filename, "size": f.size, "uploaded_by": f.uploaded_by, "created_at": f.created_at}
            for f in files
        ],
    }


class FolderCreateIn(BaseModel):
    root: str
    space: str = "shared"
    parent_id: Optional[int] = None
    name: str
    owner_id: Optional[int] = None


@router.post("/folders")
async def create_folder(payload: FolderCreateIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    if payload.root not in ROOTS:
        raise HTTPException(status_code=400, detail="잘못된 경로입니다")
    effective_owner = user.id if payload.space == "personal" else None
    if payload.space == "personal" and payload.owner_id and user.is_admin:
        effective_owner = payload.owner_id
    parent = await _get_folder_or_404(db, payload.parent_id) if payload.parent_id else None
    await _check_access(parent, payload.space, effective_owner, user, db, write=True)

    f = StorageFolder(
        root=payload.root, space=payload.space, owner_id=effective_owner, parent_id=payload.parent_id,
        name=payload.name.strip() or "새 폴더", created_by=user.id, created_at=_now(),
    )
    db.add(f)
    await db.commit()
    await db.refresh(f)
    return {"id": f.id}


class FolderUpdateIn(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None
    move_to_root: bool = False  # parent_id=None 으로 최상위 이동 시 True (None과 "안 바꿈"을 구분하기 위함)


@router.patch("/folders/{folder_id}")
async def update_folder(folder_id: int, payload: FolderUpdateIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    folder = await _get_folder_or_404(db, folder_id)
    await _check_access(folder, folder.space, folder.owner_id, user, db, write=True)

    if payload.name is not None:
        folder.name = payload.name.strip() or folder.name
    if payload.parent_id is not None or payload.move_to_root:
        new_parent_id = None if payload.move_to_root else payload.parent_id
        if new_parent_id == folder.id:
            raise HTTPException(status_code=400, detail="폴더를 자기 자신으로 이동할 수 없습니다")
        if new_parent_id and await _is_descendant(db, folder.id, new_parent_id):
            raise HTTPException(status_code=400, detail="하위 폴더로는 이동할 수 없습니다")
        new_parent = await _get_folder_or_404(db, new_parent_id) if new_parent_id else None
        await _check_access(new_parent, folder.space, folder.owner_id, user, db, write=True)
        folder.parent_id = new_parent_id
    await db.commit()
    return {"ok": True}


async def _delete_folder_recursive(db: AsyncSession, folder_id: int):
    files = (await db.execute(select(StorageFile).where(StorageFile.folder_id == folder_id))).scalars().all()
    for f in files:
        path = os.path.join(UPLOAD_DIR, f.file_key)
        if os.path.exists(path):
            os.remove(path)
        await db.delete(f)
    subfolders = (await db.execute(select(StorageFolder).where(StorageFolder.parent_id == folder_id))).scalars().all()
    for sub in subfolders:
        await _delete_folder_recursive(db, sub.id)
    folder = await _get_folder_or_404(db, folder_id)
    await db.delete(folder)


@router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    folder = await _get_folder_or_404(db, folder_id)
    await _check_access(folder, folder.space, folder.owner_id, user, db, write=True)
    await _delete_folder_recursive(db, folder_id)
    await db.commit()
    return {"ok": True}


class CopyIn(BaseModel):
    target_folder_id: Optional[int] = None
    move_to_root: bool = False


async def _copy_folder_recursive(db: AsyncSession, folder: StorageFolder, target_parent_id: Optional[int], user: User) -> StorageFolder:
    new_folder = StorageFolder(
        root=folder.root, space=folder.space, owner_id=folder.owner_id, parent_id=target_parent_id,
        name=folder.name, created_by=user.id, created_at=_now(),
    )
    db.add(new_folder)
    await db.flush()

    files = (await db.execute(select(StorageFile).where(StorageFile.folder_id == folder.id))).scalars().all()
    for f in files:
        src = os.path.join(UPLOAD_DIR, f.file_key)
        new_key = f"{secrets.token_hex(8)}_{f.filename}"
        if os.path.exists(src):
            with open(src, "rb") as sf, open(os.path.join(UPLOAD_DIR, new_key), "wb") as df:
                df.write(sf.read())
        db.add(StorageFile(
            root=f.root, space=f.space, owner_id=f.owner_id, folder_id=new_folder.id,
            filename=f.filename, file_key=new_key, size=f.size, uploaded_by=user.id, created_at=_now(),
        ))

    subfolders = (await db.execute(select(StorageFolder).where(StorageFolder.parent_id == folder.id))).scalars().all()
    for sub in subfolders:
        await _copy_folder_recursive(db, sub, new_folder.id, user)
    return new_folder


@router.post("/folders/{folder_id}/copy")
async def copy_folder(folder_id: int, payload: CopyIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    folder = await _get_folder_or_404(db, folder_id)
    await _check_access(folder, folder.space, folder.owner_id, user, db, write=False)
    target_id = None if payload.move_to_root else payload.target_folder_id
    if target_id and await _is_descendant(db, folder.id, target_id):
        raise HTTPException(status_code=400, detail="하위 폴더로는 복사할 수 없습니다")
    target = await _get_folder_or_404(db, target_id) if target_id else None
    await _check_access(target, folder.space, folder.owner_id, user, db, write=True)
    new_folder = await _copy_folder_recursive(db, folder, target_id, user)
    await db.commit()
    return {"id": new_folder.id}


@router.post("")
async def upload_file(
    root: str = "nas",
    space: str = "shared",
    folder_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_staff),
):
    if root not in ROOTS:
        raise HTTPException(status_code=400, detail="잘못된 경로입니다")
    effective_owner = user.id if space == "personal" else None
    if space == "personal" and owner_id and user.is_admin:
        effective_owner = owner_id
    folder = await _get_folder_or_404(db, folder_id) if folder_id else None
    await _check_access(folder, space, effective_owner, user, db, write=True)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    content = await file.read()
    key = f"{secrets.token_hex(8)}_{file.filename}"
    with open(os.path.join(UPLOAD_DIR, key), "wb") as f:
        f.write(content)
    sf = StorageFile(
        root=root, space=space, owner_id=effective_owner, folder_id=folder_id,
        filename=file.filename, file_key=key, size=len(content), uploaded_by=user.id, created_at=_now(),
    )
    db.add(sf)
    await db.commit()
    await db.refresh(sf)
    return {"id": sf.id}


@router.get("/{file_id}/download")
async def download_file(file_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    f = (await db.execute(select(StorageFile).where(StorageFile.id == file_id))).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    folder = await _get_folder_or_404(db, f.folder_id) if f.folder_id else None
    await _check_access(folder, f.space, f.owner_id, user, db, write=False)
    path = os.path.join(UPLOAD_DIR, f.file_key)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="파일이 존재하지 않습니다")
    return FileResponse(path, filename=f.filename)


class FileUpdateIn(BaseModel):
    filename: Optional[str] = None
    folder_id: Optional[int] = None
    move_to_root: bool = False


@router.patch("/{file_id}")
async def update_file(file_id: int, payload: FileUpdateIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    f = (await db.execute(select(StorageFile).where(StorageFile.id == file_id))).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    folder = await _get_folder_or_404(db, f.folder_id) if f.folder_id else None
    await _check_access(folder, f.space, f.owner_id, user, db, write=True)

    if payload.filename is not None:
        f.filename = payload.filename.strip() or f.filename
    if payload.folder_id is not None or payload.move_to_root:
        new_folder_id = None if payload.move_to_root else payload.folder_id
        new_folder = await _get_folder_or_404(db, new_folder_id) if new_folder_id else None
        await _check_access(new_folder, f.space, f.owner_id, user, db, write=True)
        f.folder_id = new_folder_id
    await db.commit()
    return {"ok": True}


@router.post("/{file_id}/copy")
async def copy_file(file_id: int, payload: CopyIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    f = (await db.execute(select(StorageFile).where(StorageFile.id == file_id))).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    src_folder = await _get_folder_or_404(db, f.folder_id) if f.folder_id else None
    await _check_access(src_folder, f.space, f.owner_id, user, db, write=False)
    target_id = None if payload.move_to_root else payload.target_folder_id
    target = await _get_folder_or_404(db, target_id) if target_id else None
    await _check_access(target, f.space, f.owner_id, user, db, write=True)

    src = os.path.join(UPLOAD_DIR, f.file_key)
    new_key = f"{secrets.token_hex(8)}_{f.filename}"
    if os.path.exists(src):
        with open(src, "rb") as sf, open(os.path.join(UPLOAD_DIR, new_key), "wb") as df:
            df.write(sf.read())
    new_file = StorageFile(
        root=f.root, space=f.space, owner_id=f.owner_id, folder_id=target_id,
        filename=f.filename, file_key=new_key, size=f.size, uploaded_by=user.id, created_at=_now(),
    )
    db.add(new_file)
    await db.commit()
    await db.refresh(new_file)
    return {"id": new_file.id}


@router.delete("/{file_id}")
async def delete_file(file_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    f = (await db.execute(select(StorageFile).where(StorageFile.id == file_id))).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    folder = await _get_folder_or_404(db, f.folder_id) if f.folder_id else None
    await _check_access(folder, f.space, f.owner_id, user, db, write=True)
    path = os.path.join(UPLOAD_DIR, f.file_key)
    if os.path.exists(path):
        os.remove(path)
    await db.delete(f)
    await db.commit()
    return {"ok": True}


class BulkDeleteIn(BaseModel):
    file_ids: list[int] = []
    folder_ids: list[int] = []


@router.post("/bulk-delete")
async def bulk_delete(payload: BulkDeleteIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    for fid in payload.file_ids:
        f = (await db.execute(select(StorageFile).where(StorageFile.id == fid))).scalar_one_or_none()
        if not f:
            continue
        folder = await _get_folder_or_404(db, f.folder_id) if f.folder_id else None
        await _check_access(folder, f.space, f.owner_id, user, db, write=True)
        path = os.path.join(UPLOAD_DIR, f.file_key)
        if os.path.exists(path):
            os.remove(path)
        await db.delete(f)
    for fold_id in payload.folder_ids:
        folder = (await db.execute(select(StorageFolder).where(StorageFolder.id == fold_id))).scalar_one_or_none()
        if not folder:
            continue
        await _check_access(folder, folder.space, folder.owner_id, user, db, write=True)
        await _delete_folder_recursive(db, fold_id)
    await db.commit()
    return {"ok": True}


# ────────────────────────────────────────────────────────
# 관리자 — 공유 클라우드 폴더별 직급 권한 관리
# ────────────────────────────────────────────────────────
class StorageFolderPermissionIn(BaseModel):
    folder_id: int
    position: str
    permission_level: str  # view | edit


@router.get("/permissions")
async def list_folder_permissions(db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 접근 가능합니다")
    rows = (await db.execute(select(StorageFolderPermission))).scalars().all()
    return [{"id": p.id, "folder_id": p.folder_id, "position": p.position, "permission_level": p.permission_level} for p in rows]


@router.post("/permissions")
async def create_folder_permission(payload: StorageFolderPermissionIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 접근 가능합니다")
    if payload.permission_level not in ("view", "edit"):
        raise HTTPException(status_code=400, detail="잘못된 권한값입니다")
    p = StorageFolderPermission(**payload.model_dump())
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return {"id": p.id}


@router.delete("/permissions/{perm_id}")
async def delete_folder_permission(perm_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 접근 가능합니다")
    p = (await db.execute(select(StorageFolderPermission).where(StorageFolderPermission.id == perm_id))).scalar_one_or_none()
    if p:
        await db.delete(p)
        await db.commit()
    return {"ok": True}


@router.get("/folder-tree")
async def folder_tree(root: str = "nas", db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    """관리자 권한 설정 화면에서 폴더를 고를 수 있도록 공유 클라우드 전체 폴더를 평평하게(경로 표시용) 반환."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 접근 가능합니다")
    rows = (await db.execute(select(StorageFolder).where(StorageFolder.root == root, StorageFolder.space == "shared"))).scalars().all()
    by_id = {f.id: f for f in rows}

    def path_of(f: StorageFolder) -> str:
        parts = [f.name]
        cur = f
        while cur.parent_id and cur.parent_id in by_id:
            cur = by_id[cur.parent_id]
            parts.append(cur.name)
        return " / ".join(reversed(parts))

    return [{"id": f.id, "path": path_of(f)} for f in rows]
