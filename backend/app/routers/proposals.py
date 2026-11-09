"""제안서 제작 API — 제안서 CRUD·복사·미리보기·PDF/PPT 내려받기, 치료장비 품목 관리, 제안서용 사진.

미리보기 HTML의 사진 주소는 '/api/proposals/…'로 시작하는 상대 주소다. 프론트가 iframe에 넣을 때
<base href="API 주소">를 붙여서, 운영(같은 도메인)·개발(포트 다름) 모두에서 같은 HTML을 쓴다.
PDF는 같은 HTML을 file:// 주소로 렌더한다(Chromium이 디스크에서 바로 읽음).
"""
import asyncio
import json
import logging
import os
import re
import secrets
from datetime import date
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Proposal, ProposalLastPrice, ProposalTherapyItem, User
from app.proposal import catalog, export, therapy_image
from app.proposal.pages import build_pages
from app.proposal.pdf import html_to_pdf
from app.proposal.render import STATIC_DIR, render_html
from app.proposal.schemas import ProposalIn, ProposalItems, price_memory, validate_items
from app.routers.auth import require_staff

router = APIRouter(prefix="/api/proposals", tags=["proposals"])
log = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BACKEND_DIR / "uploads" / "proposal_therapy"
MAX_UPLOAD = 10 * 1024 * 1024
_KEY_RE = re.compile(r"^[0-9a-f]{24}\.png$")
API_STATIC = "/api/proposals/static/"
API_UPLOAD = "/api/proposals/therapy-image/"


# ---------- 사진 (공개: 제품 사진이라 민감하지 않고, iframe 미리보기가 쿠키 없이도 읽게) ----------
@router.get("/static/{path:path}")
async def proposal_static(path: str):
    target = (STATIC_DIR / path).resolve()
    if STATIC_DIR.resolve() not in target.parents or not target.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(target, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/therapy-image/{key}")
async def therapy_image_file(key: str):
    if not _KEY_RE.match(key) or not (UPLOAD_DIR / key).is_file():
        raise HTTPException(status_code=404)
    return FileResponse(UPLOAD_DIR / key, headers={"Cache-Control": "public, max-age=31536000, immutable"})


def _image_url(key: Optional[str]) -> Optional[str]:
    if not key:
        return None
    if key.startswith("seed/"):
        return f"{API_STATIC}therapy/{key[5:]}"
    if key.startswith("up/"):
        return f"{API_UPLOAD}{key[3:]}"
    return None


# ---------- 치료장비 품목 ----------
class TherapyItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    maker: Optional[str] = Field(None, max_length=60)
    model: Optional[str] = Field(None, max_length=80)
    note: Optional[str] = Field(None, max_length=500)
    warranty: Optional[str] = Field(None, max_length=30)
    is_active: bool = True


class ReorderIn(BaseModel):
    ids: list[int]


def _item_out(it: ProposalTherapyItem) -> dict:
    return {"id": it.id, "name": it.name, "maker": it.maker, "model": it.model, "note": it.note,
            "warranty": it.warranty, "image_key": it.image_key, "image_url": _image_url(it.image_key),
            "sort_order": it.sort_order, "is_active": it.is_active}


def _snapshot(it: ProposalTherapyItem) -> dict:
    return {"name": it.name, "maker": it.maker or "", "model": it.model or "", "note": it.note or "",
            "warranty": it.warranty or "", "image_key": it.image_key}


def _blank(v: Optional[str]) -> Optional[str]:
    v = (v or "").strip()
    return v or None


@router.get("/therapy-items")
async def list_therapy_items(include_inactive: bool = False, db: AsyncSession = Depends(get_db),
                             _: User = Depends(require_staff)):
    q = select(ProposalTherapyItem).order_by(ProposalTherapyItem.sort_order, ProposalTherapyItem.id)
    if not include_inactive:
        q = q.where(ProposalTherapyItem.is_active.is_(True))
    return [_item_out(it) for it in (await db.execute(q)).scalars()]


@router.post("/therapy-items")
async def create_therapy_item(payload: TherapyItemIn, db: AsyncSession = Depends(get_db),
                              _: User = Depends(require_staff)):
    top = (await db.execute(select(func.max(ProposalTherapyItem.sort_order)))).scalar() or 0
    it = ProposalTherapyItem(name=payload.name.strip(), maker=_blank(payload.maker), model=_blank(payload.model),
                             note=_blank(payload.note), warranty=_blank(payload.warranty),
                             is_active=payload.is_active, sort_order=top + 1)
    db.add(it)
    await db.commit()
    return _item_out(it)


async def _get_item(db: AsyncSession, item_id: int) -> ProposalTherapyItem:
    it = await db.get(ProposalTherapyItem, item_id)
    if not it:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다")
    return it


@router.put("/therapy-items/{item_id}")
async def update_therapy_item(item_id: int, payload: TherapyItemIn, db: AsyncSession = Depends(get_db),
                              _: User = Depends(require_staff)):
    it = await _get_item(db, item_id)
    it.name = payload.name.strip()
    it.maker, it.model = _blank(payload.maker), _blank(payload.model)
    it.note, it.warranty = _blank(payload.note), _blank(payload.warranty)
    it.is_active = payload.is_active
    await db.commit()
    return _item_out(it)


@router.post("/therapy-items/reorder")
async def reorder_therapy_items(payload: ReorderIn, db: AsyncSession = Depends(get_db),
                                _: User = Depends(require_staff)):
    rows = {it.id: it for it in (await db.execute(
        select(ProposalTherapyItem).where(ProposalTherapyItem.id.in_(payload.ids)))).scalars()}
    if len(rows) != len(set(payload.ids)):
        raise HTTPException(status_code=404, detail="없는 품목이 있습니다")
    for i, item_id in enumerate(payload.ids, start=1):
        rows[item_id].sort_order = i
    await db.commit()
    return {"ok": True}


@router.post("/therapy-items/{item_id}/image")
async def upload_therapy_image(item_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db),
                               _: User = Depends(require_staff)):
    it = await _get_item(db, item_id)
    raw = await file.read()
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(status_code=422, detail="사진은 10MB 이하만 올릴 수 있습니다")
    try:
        png = therapy_image.process(raw)
    except ValueError:
        raise HTTPException(status_code=422, detail="이미지 파일(jpg/png/webp/heic)만 올릴 수 있습니다")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    key = f"{secrets.token_hex(12)}.png"
    (UPLOAD_DIR / key).write_bytes(png)
    # 원본도 남겨 둔다(처리 방식을 바꿔 다시 만들 수 있게).
    (UPLOAD_DIR / f"{key[:-4]}.orig").write_bytes(raw)
    it.image_key = f"up/{key}"
    await db.commit()
    return _item_out(it)


# ---------- 제안서 ----------
def _author_name(u: Optional[User]) -> str:
    return (u.display_name or u.username) if u else ""


def _summary(items: dict) -> str:
    parts = []
    for key, label in (("xray", "X-RAY"), ("carm", "C-ARM"), ("mammo", "MAMMO"), ("bmd", "BMD")):
        if items.get(key):
            parts.append(f"{label} {len(items[key])}")
    if items.get("ultrasound"):
        parts.append(f"초음파 {sum(len(b['models']) for b in items['ultrasound'])}")
    for key, label in (("lipus", "LIPUS"), ("eswt", "ESWT"), ("emg", "근전도")):
        if items.get(key):
            parts.append(f"{label} {len(items[key])}")
    if items.get("therapy"):
        parts.append(f"치료장비 {len(items['therapy'])}")
    return " · ".join(parts)


def _out(p: Proposal, author: Optional[User], full: bool = True) -> dict:
    items = json.loads(p.items or "{}")
    d = {"id": p.id, "hospital_name": p.hospital_name, "doctor_name": p.doctor_name,
         "proposal_date": p.proposal_date, "rep_name": p.rep_name, "rep_title": p.rep_title,
         "rep_phone": p.rep_phone, "design": p.design, "author_id": p.author_id,
         "author_name": _author_name(author), "copied_from_id": p.copied_from_id,
         "summary": _summary(items), "updated_at": p.updated_at.isoformat() if p.updated_at else None}
    if full:
        d["items"] = items
    return d


async def _fill_snapshots(db: AsyncSession, items: ProposalItems, refresh: bool) -> None:
    """치료장비 줄에 품목 정보를 복사해 넣는다. refresh=False면 이미 있는 스냅샷은 그대로 둔다."""
    need = [t.item_id for t in items.therapy if refresh or not t.snapshot]
    if not need:
        return
    found = {it.id: it for it in (await db.execute(
        select(ProposalTherapyItem).where(ProposalTherapyItem.id.in_(need)))).scalars()}
    missing = sorted(set(need) - set(found))
    if missing:
        raise HTTPException(status_code=422, detail=f"없는 치료장비 품목: {missing}")
    for t in items.therapy:
        if t.item_id in found and (refresh or not t.snapshot):
            t.snapshot = _snapshot(found[t.item_id])


def _check(items: ProposalItems) -> None:
    errors = validate_items(items)
    if errors:
        raise HTTPException(status_code=422, detail=errors)


async def _load(db: AsyncSession, pid: int) -> Proposal:
    p = await db.get(Proposal, pid)
    if not p:
        raise HTTPException(status_code=404, detail="제안서를 찾을 수 없습니다")
    return p


async def _remember_prices(db: AsyncSession, items: ProposalItems) -> None:
    """저장한 금액을 '마지막 금액'으로 남긴다 — 다음 제안서에서 같은 장비를 고르면 이 값이 기본으로 들어간다."""
    for key, (price, qty) in price_memory(items).items():
        stmt = sqlite_insert(ProposalLastPrice).values(key=key, price=price, qty=qty)
        await db.execute(stmt.on_conflict_do_update(
            index_elements=["key"], set_={"price": price, "qty": qty, "updated_at": func.current_timestamp()}))


@router.get("/catalog")
async def get_catalog(db: AsyncSession = Depends(get_db), _: User = Depends(require_staff)):
    therapy = (await db.execute(select(ProposalTherapyItem).where(ProposalTherapyItem.is_active.is_(True))
                                .order_by(ProposalTherapyItem.sort_order, ProposalTherapyItem.id))).scalars()
    # 기본 금액: 기존 제안서 금액(코드) 위에 마지막 저장 금액(DB)을 덮어쓴다.
    defaults = {k: {"price": v, "qty": None} for k, v in catalog.DEFAULT_PRICES.items()}
    for row in (await db.execute(select(ProposalLastPrice))).scalars():
        defaults[row.key] = {"price": row.price, "qty": row.qty}
    return {**catalog.catalog_for_client(), "therapy": [_item_out(it) for it in therapy], "defaults": defaults}


@router.post("/preview", response_class=HTMLResponse)
async def preview(payload: ProposalIn, db: AsyncSession = Depends(get_db), _: User = Depends(require_staff)):
    _check(payload.items)
    await _fill_snapshots(db, payload.items, refresh=False)
    html = render_html(payload.model_dump(exclude={"items"}), build_pages(payload.items),
                       asset_base=API_STATIC, upload_base=API_UPLOAD)
    return HTMLResponse(html)


@router.get("")
async def list_proposals(q: str = "", db: AsyncSession = Depends(get_db), _: User = Depends(require_staff)):
    stmt = select(Proposal, User).join(User, User.id == Proposal.author_id, isouter=True) \
        .order_by(Proposal.updated_at.desc(), Proposal.id.desc())
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Proposal.hospital_name.like(like), Proposal.doctor_name.like(like)))
    return [_out(p, u, full=False) for p, u in (await db.execute(stmt)).all()]


@router.post("")
async def create_proposal(payload: ProposalIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    _check(payload.items)
    await _fill_snapshots(db, payload.items, refresh=False)
    p = Proposal(**payload.model_dump(exclude={"items"}), items=payload.items.model_dump_json(), author_id=user.id)
    db.add(p)
    await _remember_prices(db, payload.items)
    await db.commit()
    return _out(p, user)


@router.get("/{pid}")
async def get_proposal(pid: int, db: AsyncSession = Depends(get_db), _: User = Depends(require_staff)):
    p = await _load(db, pid)
    return _out(p, await db.get(User, p.author_id))


@router.put("/{pid}")
async def update_proposal(pid: int, payload: ProposalIn, db: AsyncSession = Depends(get_db),
                          _: User = Depends(require_staff)):
    p = await _load(db, pid)
    _check(payload.items)
    await _fill_snapshots(db, payload.items, refresh=False)
    for k, v in payload.model_dump(exclude={"items"}).items():
        setattr(p, k, v)
    p.items = payload.items.model_dump_json()
    await _remember_prices(db, payload.items)
    await db.commit()
    return _out(p, await db.get(User, p.author_id))


@router.delete("/{pid}")
async def delete_proposal(pid: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    p = await _load(db, pid)
    if p.author_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="작성자 또는 관리자만 삭제할 수 있습니다")
    await db.delete(p)
    await db.commit()
    return {"ok": True}


@router.post("/{pid}/copy")
async def copy_proposal(pid: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_staff)):
    src = await _load(db, pid)
    items = ProposalItems.model_validate_json(src.items or "{}")
    # 복사본은 지금 품목 정보로 다시 채운다(품목은 지우지 않고 '사용 안 함'으로만 숨기므로 늘 찾을 수 있다).
    await _fill_snapshots(db, items, refresh=True)
    p = Proposal(kind=src.kind, hospital_name=src.hospital_name, doctor_name=src.doctor_name,
                 proposal_date=date.today().isoformat(), rep_name=src.rep_name, rep_title=src.rep_title,
                 rep_phone=src.rep_phone, design=src.design, items=items.model_dump_json(),
                 author_id=user.id, copied_from_id=src.id)
    db.add(p)
    await db.commit()
    return _out(p, user)


@router.post("/{pid}/export")
async def proposal_export(pid: int, fmt: Literal["pdf", "pptx"] = "pdf",
                          db: AsyncSession = Depends(get_db), _: User = Depends(require_staff)):
    """PDF/PPT 파일을 만들어 잠깐 보관하고 내려받을 주소를 돌려준다(이유는 app/proposal/export.py)."""
    p = await _load(db, pid)
    items = ProposalItems.model_validate_json(p.items or "{}")
    meta = {k: getattr(p, k) for k in ("hospital_name", "doctor_name", "proposal_date", "rep_name",
                                       "rep_title", "rep_phone", "design")}
    html = render_html(meta, build_pages(items), asset_base=STATIC_DIR.as_uri() + "/",
                       upload_base=UPLOAD_DIR.as_uri() + "/", for_pdf=True)
    label = "PDF" if fmt == "pdf" else "PPT"
    try:
        data = await html_to_pdf(html)
        if fmt == "pptx":
            data = await asyncio.to_thread(export.pdf_to_pptx, data)
    except Exception:  # noqa: BLE001 — Chromium·PPT 변환 오류 모두 같은 안내
        log.exception("제안서 %s 생성 실패", label)
        raise HTTPException(status_code=503, detail=f"{label}를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.")
    name = f"{p.proposal_date}_제안서_{p.hospital_name} {p.doctor_name}.{fmt}"
    name = re.sub(r'[\\/:*?"<>|]', "_", name)
    token = export.save_export(data, name, export.PDF_TYPE if fmt == "pdf" else export.PPTX_TYPE)
    return {"url": f"/api/proposals/download/{token}/{quote(name)}", "filename": name}


@router.get("/download/{token}/{name}")
async def proposal_download(token: str, name: str):
    """보관해 둔 파일. 주소 끝이 실제 파일명이라 Content-Disposition을 못 읽는 다운로드 관리자도 이름·확장자를 맞게 쓴다."""
    found = export.load_export(token)
    if not found:
        raise HTTPException(status_code=404, detail="내려받기 주소가 만료됐습니다. 다시 눌러 주세요.")
    path, filename, media_type = found
    ascii_name = "proposal." + filename.rsplit(".", 1)[-1]
    return FileResponse(path, media_type=media_type, headers={
        "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}",
        "Cache-Control": "no-store",
    })
