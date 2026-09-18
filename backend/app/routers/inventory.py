from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import InvChangeLog, InvEquipment, InvSupply, User
from app.routers.auth import require_staff

router = APIRouter(prefix="/api/inventory", tags=["inventory"])

# 셀 편집이 허용되는 컬럼. 여기 없는 컬럼(id/updated_at 등)은 클라이언트가 지정해도 무시된다.
EQ_EDITABLE = [
    "grade", "name", "serial_no", "location", "notes", "manufacture_date",
    "manufacturer", "purchase_price", "purchase_from", "is_opened", "item_type", "category",
]

EQ_BOOL_FIELDS = {"is_opened"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _actor_name(user: Optional[User]) -> Optional[str]:
    if not user:
        return None
    return user.display_name or user.username


def _to_text(v: Any) -> str:
    """이력에 남길 표시용 문자열. None과 빈 문자열은 모두 ''로 본다(빈 셀은 하나의 상태)."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "개봉" if v else "미개봉"
    return str(v)


def _coerce(field: str, value: Any) -> Any:
    if field in EQ_BOOL_FIELDS:
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in ("1", "true", "y", "yes", "개봉", "o")
    if value is None:
        return None
    return str(value)


def _same(a: Any, b: Any) -> bool:
    """빈 문자열과 None은 같은 값으로 취급 — 셀을 비우는 동작이 충돌로 잡히지 않게."""
    if isinstance(a, bool) or isinstance(b, bool):
        return bool(a) == bool(b)
    return (a if a is not None else "") == (b if b is not None else "")


def _log(
    db: AsyncSession, *, table: str, row_id: int, category: Optional[str], label: Optional[str],
    action: str, field: Optional[str], old: Any, new: Any, user: Optional[User],
) -> None:
    """변경 이력 한 줄 추가. commit은 호출부에 얹혀 나간다."""
    db.add(InvChangeLog(
        table_name=table, row_id=row_id, category=category, row_label=label, action=action,
        field=field,
        old_value=_to_text(old) if field else None,
        new_value=_to_text(new) if field else None,
        actor_user_id=user.id if user else None, actor_name=_actor_name(user), created_at=_now(),
    ))


class InvEquipmentIn(BaseModel):
    category: str  # 지멘스 | 타사
    item_type: str
    grade: Optional[str] = None
    name: str
    serial_no: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    manufacture_date: Optional[str] = None
    manufacturer: Optional[str] = None
    purchase_price: Optional[str] = None
    purchase_from: Optional[str] = None
    is_opened: bool = False
    # 낙관적 잠금 — 클라이언트가 읽었던 updated_at. 서버 값과 다르면 409.
    expected_updated_at: Optional[str] = None


class InvSupplyIn(BaseModel):
    branch: str = "서울"
    number: Optional[int] = None
    name: str
    location: Optional[str] = None
    quantity: Optional[str] = None
    expected_updated_at: Optional[str] = None


class CellEdit(BaseModel):
    row_id: int
    field: str
    old_value: Any = None   # 클라이언트가 편집을 시작할 때 화면에 있던 값
    new_value: Any = None
    force: bool = False     # 충돌 알림을 보고 "내 값으로 덮어쓰기"를 누른 경우


class CellEditsIn(BaseModel):
    edits: List[CellEdit]


def _eq_dict(e: InvEquipment, names: Optional[dict] = None) -> dict:
    return {
        "id": e.id, "category": e.category, "item_type": e.item_type, "grade": e.grade,
        "name": e.name, "serial_no": e.serial_no, "location": e.location, "notes": e.notes,
        "manufacture_date": e.manufacture_date, "manufacturer": e.manufacturer,
        "purchase_price": e.purchase_price, "purchase_from": e.purchase_from,
        "is_opened": e.is_opened, "updated_at": e.updated_at, "updated_by": e.updated_by,
        "updated_by_name": (names or {}).get(e.updated_by),
    }


def _supply_dict(s: InvSupply, names: Optional[dict] = None) -> dict:
    return {
        "id": s.id, "branch": s.branch, "number": s.number, "name": s.name,
        "location": s.location, "quantity": s.quantity, "updated_at": s.updated_at,
        "updated_by": s.updated_by, "updated_by_name": (names or {}).get(s.updated_by),
    }


async def _name_map(db: AsyncSession, rows) -> dict:
    """updated_by(user id) → 표시 이름. 행마다 조회하지 않도록 한 번에 모아 온다."""
    ids = {r.updated_by for r in rows if r.updated_by}
    if not ids:
        return {}
    users = (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all()
    return {u.id: (u.display_name or u.username) for u in users}


# ---------------------------------------------------------------- 장비 재고


@router.get("/equipment")
async def list_equipment(db: AsyncSession = Depends(get_db), category: Optional[str] = None, user: User = Depends(require_staff)):
    q = select(InvEquipment)
    if category:
        q = q.where(InvEquipment.category == category)
    q = q.order_by(InvEquipment.category, InvEquipment.item_type, InvEquipment.id)
    rows = (await db.execute(q)).scalars().all()
    names = await _name_map(db, rows)
    return [_eq_dict(e, names) for e in rows]


@router.get("/equipment/sync")
async def sync_equipment(
    db: AsyncSession = Depends(get_db),
    category: Optional[str] = None,
    since: Optional[str] = None,
    user: User = Depends(require_staff),
):
    """짧은 주기 폴링용 델타 동기화.
    since(직전 응답의 server_time)를 주면 그 이후 바뀐 행과 삭제된 행 id만 돌려준다.
    since가 없으면 전체 목록(첫 로드)."""
    server_time = _now()
    q = select(InvEquipment)
    if category:
        q = q.where(InvEquipment.category == category)
    if since:
        q = q.where(InvEquipment.updated_at.is_not(None), InvEquipment.updated_at >= since)
    q = q.order_by(InvEquipment.category, InvEquipment.item_type, InvEquipment.id)
    rows = (await db.execute(q)).scalars().all()
    names = await _name_map(db, rows)

    deleted: List[int] = []
    if since:
        dq = select(InvChangeLog.row_id).where(
            InvChangeLog.table_name == "inv_equipment",
            InvChangeLog.action == "delete",
            InvChangeLog.created_at >= since,
        )
        if category:
            dq = dq.where(InvChangeLog.category == category)
        deleted = sorted({r for r in (await db.execute(dq)).scalars().all()})

    return {
        "server_time": server_time,
        "full": since is None,
        "rows": [_eq_dict(e, names) for e in rows],
        "deleted": deleted,
    }


@router.post("/equipment")
async def create_equipment(payload: InvEquipmentIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    data = payload.model_dump(exclude={"expected_updated_at"})
    e = InvEquipment(**data, updated_at=_now(), updated_by=user.id)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    _log(db, table="inv_equipment", row_id=e.id, category=e.category, label=e.name,
         action="create", field=None, old=None, new=None, user=user)
    await db.commit()
    return _eq_dict(e, {user.id: _actor_name(user)})


@router.post("/equipment/cells")
async def update_equipment_cells(payload: CellEditsIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    """셀 단위 저장. 붙여넣기처럼 한 번에 여러 셀이 바뀌는 경우도 이 엔드포인트 하나로 처리한다.

    충돌 판정은 '행'이 아니라 '셀' 단위다 — 두 사람이 같은 행의 다른 칸을 고치는 건 정상 동작이고,
    같은 칸을 동시에 고쳤을 때만 그 셀을 적용하지 않고 conflicts로 돌려준다(부분 성공).
    내가 편집을 시작할 때 화면에 있던 값(old_value)과 현재 DB 값이 다르면 그 셀은 충돌이다."""
    ids = {e.row_id for e in payload.edits}
    if not ids:
        return {"updated": [], "conflicts": [], "missing": [], "server_time": _now()}

    rows = (await db.execute(select(InvEquipment).where(InvEquipment.id.in_(ids)))).scalars().all()
    by_id = {r.id: r for r in rows}
    prev_names = await _name_map(db, rows)  # 충돌 시 "누가 먼저 고쳤는지" 표시용

    updated_ids: set = set()
    conflicts: List[dict] = []
    missing: List[int] = []
    now = _now()

    for edit in payload.edits:
        e = by_id.get(edit.row_id)
        if e is None:
            missing.append(edit.row_id)
            continue
        if edit.field not in EQ_EDITABLE:
            continue
        current = getattr(e, edit.field)
        new_val = _coerce(edit.field, edit.new_value)
        if _same(current, new_val):
            continue
        if not edit.force:
            expected = _coerce(edit.field, edit.old_value)
            if not _same(current, expected):
                conflicts.append({
                    "row_id": e.id, "field": edit.field, "row_label": e.name,
                    "mine": _to_text(new_val), "theirs": _to_text(current),
                    "theirs_raw": current, "base": _to_text(expected),
                    "actor_name": prev_names.get(e.updated_by),
                })
                continue
        setattr(e, edit.field, new_val)
        e.updated_at = now
        e.updated_by = user.id
        updated_ids.add(e.id)
        _log(db, table="inv_equipment", row_id=e.id, category=e.category, label=e.name,
             action="update", field=edit.field, old=current, new=new_val, user=user)

    if updated_ids:
        await db.commit()

    names = {user.id: _actor_name(user)}
    return {
        "updated": [_eq_dict(by_id[i], names) for i in sorted(updated_ids)],
        "conflicts": conflicts,
        "missing": missing,
        "server_time": _now(),
    }


@router.patch("/equipment/{eid}")
async def update_equipment(eid: int, payload: InvEquipmentIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    e = (await db.execute(select(InvEquipment).where(InvEquipment.id == eid))).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다")
    if payload.expected_updated_at and e.updated_at and e.updated_at != payload.expected_updated_at:
        raise HTTPException(status_code=409, detail={
            "message": "다른 사용자가 먼저 수정했습니다",
            "current": _eq_dict(e, await _name_map(db, [e])),
        })
    changes = []
    for k, v in payload.model_dump(exclude={"expected_updated_at"}).items():
        old = getattr(e, k)
        if not _same(old, v):
            changes.append((k, old, v))
            setattr(e, k, v)
    if changes:
        e.updated_at = _now()
        e.updated_by = user.id
        for field, old, new in changes:
            _log(db, table="inv_equipment", row_id=e.id, category=e.category, label=e.name,
                 action="update", field=field, old=old, new=new, user=user)
        await db.commit()
        await db.refresh(e)
    return _eq_dict(e, await _name_map(db, [e]))


@router.delete("/equipment/{eid}")
async def delete_equipment(eid: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    e = (await db.execute(select(InvEquipment).where(InvEquipment.id == eid))).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다")
    _log(db, table="inv_equipment", row_id=e.id, category=e.category, label=e.name,
         action="delete", field=None, old=None, new=None, user=user)
    await db.delete(e)
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- 소모품 재고


@router.get("/supplies")
async def list_supplies(db: AsyncSession = Depends(get_db), branch: Optional[str] = None, user: User = Depends(require_staff)):
    q = select(InvSupply)
    if branch:
        q = q.where(InvSupply.branch == branch)
    q = q.order_by(InvSupply.id)
    rows = (await db.execute(q)).scalars().all()
    names = await _name_map(db, rows)
    return [_supply_dict(s, names) for s in rows]


@router.post("/supplies")
async def create_supply(payload: InvSupplyIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    s = InvSupply(**payload.model_dump(exclude={"expected_updated_at"}), updated_at=_now(), updated_by=user.id)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    _log(db, table="inv_supplies", row_id=s.id, category=s.branch, label=s.name,
         action="create", field=None, old=None, new=None, user=user)
    await db.commit()
    return _supply_dict(s, {user.id: _actor_name(user)})


@router.patch("/supplies/{sid}")
async def update_supply(sid: int, payload: InvSupplyIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    s = (await db.execute(select(InvSupply).where(InvSupply.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다")
    if payload.expected_updated_at and s.updated_at and s.updated_at != payload.expected_updated_at:
        raise HTTPException(status_code=409, detail={
            "message": "다른 사용자가 먼저 수정했습니다",
            "current": _supply_dict(s, await _name_map(db, [s])),
        })
    changes = []
    for k, v in payload.model_dump(exclude={"expected_updated_at"}).items():
        old = getattr(s, k)
        if not _same(old, v):
            changes.append((k, old, v))
            setattr(s, k, v)
    if changes:
        s.updated_at = _now()
        s.updated_by = user.id
        for field, old, new in changes:
            _log(db, table="inv_supplies", row_id=s.id, category=s.branch, label=s.name,
                 action="update", field=field, old=old, new=new, user=user)
        await db.commit()
        await db.refresh(s)
    return _supply_dict(s, await _name_map(db, [s]))


@router.delete("/supplies/{sid}")
async def delete_supply(sid: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    s = (await db.execute(select(InvSupply).where(InvSupply.id == sid))).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="항목을 찾을 수 없습니다")
    _log(db, table="inv_supplies", row_id=s.id, category=s.branch, label=s.name,
         action="delete", field=None, old=None, new=None, user=user)
    await db.delete(s)
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- 변경 이력


@router.get("/history")
async def list_history(
    db: AsyncSession = Depends(get_db),
    table: str = "inv_equipment",
    category: Optional[str] = None,
    row_id: Optional[int] = None,
    limit: int = 200,
    user: User = Depends(require_staff),
):
    """변경 이력 조회. row_id를 주면 그 행의 이력만(행 단위 '변경 내역')."""
    q = select(InvChangeLog).where(InvChangeLog.table_name == table)
    if category:
        q = q.where(InvChangeLog.category == category)
    if row_id is not None:
        q = q.where(InvChangeLog.row_id == row_id)
    q = q.order_by(InvChangeLog.id.desc()).limit(min(max(limit, 1), 500))
    rows = (await db.execute(q)).scalars().all()
    return [{
        "id": r.id, "row_id": r.row_id, "row_label": r.row_label, "action": r.action,
        "field": r.field, "old_value": r.old_value, "new_value": r.new_value,
        "actor_name": r.actor_name, "created_at": r.created_at,
    } for r in rows]
