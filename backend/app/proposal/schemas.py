"""제안서 입력(items JSON) 검증. 형식은 Pydantic, 카탈로그 일치 여부는 validate_items."""
import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from . import catalog

Price = Field(gt=0, le=10_000_000_000)


class OptionLine(BaseModel):
    key: str
    price: int = Price


class XrayItem(BaseModel):
    model: str
    detector_count: int = Field(1, ge=1, le=20)
    detector_type: Optional[str] = None
    table: Optional[str] = None
    price: int = Price
    tradein: Optional[int] = Field(None, ge=0)
    options: list[OptionLine] = []


class ModelPrice(BaseModel):
    model: str
    price: int = Price
    tradein: Optional[int] = Field(None, ge=0)


class PriceOnly(BaseModel):
    price: int = Price


class UsModel(BaseModel):
    model: str
    price: int = Price


class UsBrand(BaseModel):
    brand: str
    models: list[UsModel] = Field(min_length=1, max_length=4)


class TherapyLine(BaseModel):
    item_id: int
    unit_price: int = Price
    qty: int = Field(1, ge=1, le=999)
    # 저장 시 서버가 품목 정보를 복사해 넣는다(나중에 품목을 고쳐도 이 제안서는 그대로 나오게).
    snapshot: Optional[dict] = None


class ProposalItems(BaseModel):
    xray: list[XrayItem] = []
    pacs: Optional[PriceOnly] = None
    mammo: list[ModelPrice] = []
    carm: list[ModelPrice] = []
    carm_table: Optional[Literal["HCK", "01M"]] = None
    carm_reducer: Optional[PriceOnly] = None
    bmd: list[ModelPrice] = []
    ultrasound: list[UsBrand] = []
    emg: list[ModelPrice] = []
    therapy: list[TherapyLine] = []


class ProposalIn(BaseModel):
    hospital_name: str = Field(min_length=1, max_length=100)
    doctor_name: str = Field(min_length=1, max_length=50)
    proposal_date: str
    rep_name: str = Field("", max_length=50)
    rep_title: str = Field("", max_length=30)
    rep_phone: str = Field("", max_length=30)
    design: Literal["A", "C"] = "A"
    items: ProposalItems = ProposalItems()

    @field_validator("hospital_name", "doctor_name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("비어 있을 수 없습니다")
        return v

    @field_validator("proposal_date")
    @classmethod
    def _date(cls, v: str) -> str:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            raise ValueError("YYYY-MM-DD 형식이어야 합니다")
        return v


def validate_items(items: ProposalItems) -> list[str]:
    """카탈로그에 없는 모델·옵션·조합을 찾아 사람이 읽을 메시지로 돌려준다(없으면 빈 목록)."""
    errors: list[str] = []
    for x in items.xray:
        spec = catalog.XRAY_MODELS.get(x.model)
        if not spec:
            errors.append(f"X-RAY 모델 없음: {x.model}")
            continue
        if spec["type"] == "ceiling":
            if x.detector_type not in catalog.XRAY_DETECTOR_TYPES:
                errors.append(f"{x.model}: Detector 종류를 선택하세요")
            if x.table not in catalog.XRAY_TABLE_TYPES:
                errors.append(f"{x.model}: Table 종류를 선택하세요")
        for o in x.options:
            if o.key not in catalog.XRAY_OPTIONS:
                errors.append(f"{x.model}: 옵션 없음: {o.key}")
    for label, rows, table in (("MAMMOGRAPHY", items.mammo, catalog.MAMMO_MODELS),
                               ("C-ARM", items.carm, catalog.CARM_MODELS),
                               ("BMD", items.bmd, catalog.BMD_MODELS),
                               ("근전도", items.emg, catalog.EMG_MODELS)):
        for r in rows:
            if r.model not in table:
                errors.append(f"{label} 모델 없음: {r.model}")
    seen: set[str] = set()
    for b in items.ultrasound:
        brand = catalog.US_BRANDS.get(b.brand)
        if not brand:
            errors.append(f"초음파 브랜드 없음: {b.brand}")
            continue
        if b.brand in seen:
            errors.append(f"초음파 브랜드 중복: {b.brand}")
        seen.add(b.brand)
        for m in b.models:
            if m.model not in brand["models"]:
                errors.append(f"{b.brand} 모델 없음: {m.model}")
    return errors


def price_memory(items: ProposalItems) -> dict[str, tuple[int, int | None]]:
    """저장한 금액 → 다음 제안서의 기본값으로 남길 (키 → (금액, 수량)). 키 형식은 catalog.DEFAULT_PRICES와 같다."""
    out: dict[str, tuple[int, int | None]] = {}
    for x in items.xray:
        out[f"xray:{x.model}"] = (x.price, None)
        for o in x.options:
            out[f"xray_opt:{o.key}"] = (o.price, None)
    if items.pacs:
        out["pacs"] = (items.pacs.price, None)
    for prefix, rows in (("mammo", items.mammo), ("carm", items.carm), ("bmd", items.bmd), ("emg", items.emg)):
        for r in rows:
            out[f"{prefix}:{r.model}"] = (r.price, None)
    if items.carm_reducer:
        out["carm_reducer"] = (items.carm_reducer.price, None)
    for b in items.ultrasound:
        for m in b.models:
            out[f"us:{b.brand}:{m.model}"] = (m.price, None)
    for t in items.therapy:
        out[f"therapy:{t.item_id}"] = (t.unit_price, t.qty)
    return out
