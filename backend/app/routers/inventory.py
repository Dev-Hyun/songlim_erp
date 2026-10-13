from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import InvChangeLog, InvEquipment, InvSupply, InvCountStock, InvCountLog, User
from app.routers.admin import require_admin
from app.routers.auth import require_staff

router = APIRouter(prefix="/api/inventory", tags=["inventory"])

# 셀 편집이 허용되는 컬럼. 여기 없는 컬럼(id/updated_at 등)은 클라이언트가 지정해도 무시된다.
EQ_EDITABLE = [
    "name", "serial_no", "location", "notes", "manufacture_date",
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
        "id": e.id, "category": e.category, "item_type": e.item_type,
        "name": e.name, "serial_no": e.serial_no, "location": e.location, "notes": e.notes,
        "manufacture_date": e.manufacture_date, "manufacturer": e.manufacturer,
        "purchase_price": e.purchase_price, "purchase_from": e.purchase_from,
        "is_opened": e.is_opened, "sort_order": e.sort_order,
        "updated_at": e.updated_at, "updated_by": e.updated_by,
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
    q = q.order_by(InvEquipment.category, InvEquipment.item_type, InvEquipment.sort_order, InvEquipment.id)
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
    q = q.order_by(InvEquipment.category, InvEquipment.item_type, InvEquipment.sort_order, InvEquipment.id)
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
    e.sort_order = e.id  # 맨 아래
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


class ReorderIn(BaseModel):
    ids: List[int]                 # 같은 분류·구분의 행 id를 화면에 보일 순서대로
    moved_id: Optional[int] = None  # 드래그한 행(이력에 "n번째 → m번째"로 남긴다)


@router.post("/equipment/reorder")
async def reorder_equipment(payload: ReorderIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    """드래그 정렬 — 받은 순서대로 sort_order를 1..n으로 다시 매긴다.
    모든 id가 존재하고 같은 분류·구분이어야 한다. 목록에 없는 같은 구분의 행(동시에 추가된 행)은
    건드리지 않는다(sort_order=id라 어차피 맨 아래)."""
    if not payload.ids or len(set(payload.ids)) != len(payload.ids):
        raise HTTPException(status_code=400, detail="id 목록이 비었거나 중복됩니다")
    rows = (await db.execute(select(InvEquipment).where(InvEquipment.id.in_(payload.ids)))).scalars().all()
    by_id = {r.id: r for r in rows}
    missing = [i for i in payload.ids if i not in by_id]
    if missing:
        raise HTTPException(status_code=404, detail=f"없는 행: {missing}")
    groups = {(r.category, r.item_type) for r in rows}
    if len(groups) != 1:
        raise HTTPException(status_code=400, detail="같은 분류·구분의 행끼리만 순서를 바꿀 수 있습니다")

    ordered = [by_id[i] for i in payload.ids]
    before = sorted(ordered, key=lambda r: ((r.sort_order if r.sort_order is not None else r.id), r.id))
    old_pos = {r.id: k + 1 for k, r in enumerate(before)}
    now = _now()
    changed = []
    for k, r in enumerate(ordered, start=1):
        if r.sort_order != k:
            r.sort_order = k
            r.updated_at = now
            r.updated_by = user.id
            changed.append(r)
    if payload.moved_id in by_id and old_pos[payload.moved_id] != payload.ids.index(payload.moved_id) + 1:
        m = by_id[payload.moved_id]
        _log(db, table="inv_equipment", row_id=m.id, category=m.category, label=m.name,
             action="update", field="sort_order",
             old=f"{old_pos[m.id]}번째", new=f"{payload.ids.index(m.id) + 1}번째", user=user)
    await db.commit()
    for r in changed:
        await db.refresh(r)
    names = {user.id: _actor_name(user)}
    return {"updated": [_eq_dict(r, names) for r in changed], "server_time": now}


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


# ---------------------------------------------------------------- 개수 관리 (LUMOS · 쉬스)

COUNT_ITEMS = ("LUMOS", "쉬스")
COUNT_OFFICES = ("대전", "대구", "서울")


class CountUseIn(BaseModel):
    office: str
    used_on: Optional[str] = None     # YYYY-MM-DD
    site: Optional[str] = None        # 사용처(병원)
    professor: Optional[str] = None
    procedure: Optional[str] = None
    staff_name: Optional[str] = None


class CountStockItem(BaseModel):
    office: str
    on_hand: int
    used: int


class CountStockIn(BaseModel):
    items: List[CountStockItem]
    reason: Optional[str] = None


def _check_item(item: str) -> str:
    if item not in COUNT_ITEMS:
        raise HTTPException(status_code=404, detail="없는 품목입니다")
    return item


def _stock_dict(s: InvCountStock) -> dict:
    return {"office": s.office, "on_hand": s.on_hand, "used": s.used}


def _count_log_dict(l: InvCountLog) -> dict:
    return {
        "id": l.id, "item": l.item, "kind": l.kind, "office": l.office, "used_on": l.used_on, "site": l.site,
        "professor": l.professor, "procedure": l.procedure, "staff_name": l.staff_name,
        "note": l.note, "detail": l.site if l.kind == "adjust" else None,
        "on_hand_after": l.on_hand_after, "used_after": l.used_after,
        "actor_user_id": l.actor_user_id, "actor_name": l.actor_name, "created_at": l.created_at,
    }


async def _get_stock(db: AsyncSession, item: str, office: str) -> InvCountStock:
    if office not in COUNT_OFFICES:
        raise HTTPException(status_code=400, detail="사무실은 대전/대구/서울 중 하나여야 합니다")
    row = (await db.execute(
        select(InvCountStock).where(InvCountStock.item == item, InvCountStock.office == office)
    )).scalar_one_or_none()
    if row is None:
        # 마이그레이션이 품목×사무실 행을 심지만, 혹시 없으면 0/0으로 만들어 둔다
        row = InvCountStock(item=item, office=office, on_hand=0, used=0)
        db.add(row)
        await db.flush()
    return row


async def _all_stocks(db: AsyncSession, item: str) -> list:
    rows = {s.office: s for s in (await db.execute(select(InvCountStock).where(InvCountStock.item == item))).scalars().all()}
    return [_stock_dict(rows[o]) if o in rows else {"office": o, "on_hand": 0, "used": 0} for o in COUNT_OFFICES]


@router.get("/counts/{item}")
async def count_overview(item: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    _check_item(item)
    logs = (await db.execute(
        select(InvCountLog).where(InvCountLog.item == item).order_by(InvCountLog.id.desc()).limit(20)
    )).scalars().all()
    return {"item": item, "stocks": await _all_stocks(db, item), "logs": [_count_log_dict(l) for l in logs]}


@router.get("/counts/{item}/logs")
async def count_logs(
    item: str,
    db: AsyncSession = Depends(get_db),
    office: Optional[str] = None,
    month: Optional[str] = None,   # YYYY-MM — used_on 기준(adjust 행은 created_at 기준)
    limit: int = 200,
    user: User = Depends(require_staff),
):
    _check_item(item)
    q = select(InvCountLog).where(InvCountLog.item == item)
    if office:
        q = q.where(InvCountLog.office == office)
    if month:
        q = q.where(
            (InvCountLog.used_on.like(f"{month}%"))
            | ((InvCountLog.used_on.is_(None)) & (InvCountLog.created_at.like(f"{month}%")))
        )
    q = q.order_by(InvCountLog.id.desc()).limit(min(max(limit, 1), 1000))
    return [_count_log_dict(l) for l in (await db.execute(q)).scalars().all()]


@router.post("/counts/{item}/use")
async def count_use(item: str, payload: CountUseIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    """'사용하기' — 해당 사무실 보유 -1, 사용 +1, 기록 1줄."""
    _check_item(item)
    stock = await _get_stock(db, item, payload.office)
    if stock.on_hand <= 0:
        raise HTTPException(status_code=400, detail=f"{stock.office} {item} 보유 수량이 0개라 사용 처리할 수 없습니다")
    stock.on_hand -= 1
    stock.used += 1
    stock.updated_at = _now()
    stock.updated_by = user.id
    log = InvCountLog(
        item=item, kind="use", office=stock.office, used_on=payload.used_on, site=payload.site,
        professor=payload.professor, procedure=payload.procedure,
        staff_name=payload.staff_name or _actor_name(user),
        on_hand_after=stock.on_hand, used_after=stock.used,
        actor_user_id=user.id, actor_name=_actor_name(user), created_at=_now(),
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return {"stock": _stock_dict(stock), "log": _count_log_dict(log)}


@router.delete("/counts/{item}/logs/{log_id}")
async def count_undo(item: str, log_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    """잘못 누른 '사용하기'를 되돌린다 — 보유 +1, 사용 -1. 행은 지우지 않고 kind='undone'으로 남긴다.
    본인 기록이거나 ADMIN만 가능."""
    _check_item(item)
    log = (await db.execute(
        select(InvCountLog).where(InvCountLog.id == log_id, InvCountLog.item == item)
    )).scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="기록이 없습니다")
    if log.kind != "use":
        raise HTTPException(status_code=400, detail="사용 기록만 되돌릴 수 있습니다")
    if log.actor_user_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="본인 기록이거나 관리자만 되돌릴 수 있습니다")
    stock = await _get_stock(db, item, log.office)
    stock.on_hand += 1
    stock.used = max(0, stock.used - 1)
    stock.updated_at = _now()
    stock.updated_by = user.id
    log.kind = "undone"
    log.note = f"{_actor_name(user)} 되돌림"
    await db.commit()
    return {"stock": _stock_dict(stock), "log": _count_log_dict(log)}


@router.put("/counts/{item}/stock")
async def count_set_stock(item: str, payload: CountStockIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    """ADMIN 전용 — 사무실별 보유/사용 초기값을 직접 바꾼다. 바뀐 사무실마다 adjust 기록 1줄."""
    _check_item(item)
    for it in payload.items:
        if it.on_hand < 0 or it.used < 0:
            raise HTTPException(status_code=400, detail="수량은 0 이상이어야 합니다")
    for it in payload.items:
        stock = await _get_stock(db, item, it.office)
        if stock.on_hand == it.on_hand and stock.used == it.used:
            continue
        detail = f"보유 {stock.on_hand} → {it.on_hand} · 사용 {stock.used} → {it.used}"
        stock.on_hand = it.on_hand
        stock.used = it.used
        stock.updated_at = _now()
        stock.updated_by = user.id
        db.add(InvCountLog(
            item=item, kind="adjust", office=stock.office,
            note=(payload.reason or "").strip() or None,
            site=detail,  # 목록에서 한 줄로 보이게 "보유 40 → 45 · 사용 11 → 11"을 사용처 자리에 둔다
            on_hand_after=stock.on_hand, used_after=stock.used,
            actor_user_id=user.id, actor_name=_actor_name(user), created_at=_now(),
        ))
    await db.commit()
    return {"stocks": await _all_stocks(db, item)}
