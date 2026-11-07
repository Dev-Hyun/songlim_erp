"""고른 장비(items) → PDF 페이지 목록. 순수 함수라 DB·템플릿 없이 테스트한다.

페이지 순서: 표지 → 회사 소개 → X-RAY(모델들 → PACS) → MAMMOGRAPHY → C-ARM(모델들 → 전동테이블 → 저감장치)
→ BMD → ULTRASOUND(브랜드당 1장) → 치료장비(8줄씩) → 함께 하는 이유 → 마지막 장.
카테고리 안의 순서는 카탈로그 순서를 따른다(입력 순서와 무관하게 늘 같은 제안서 모양).
"""
from . import catalog
from .schemas import ProposalItems

RX_PER_PAGE = 8


def _ordered(rows, table: dict):
    order = {m: i for i, m in enumerate(table)}
    return sorted(rows, key=lambda r: order.get(r.model, len(order)))


def build_pages(items: ProposalItems) -> list[dict]:
    pages: list[dict] = [{"kind": "cover"}, {"kind": "intro"}]

    for x in _ordered(items.xray, catalog.XRAY_MODELS):
        spec = catalog.XRAY_MODELS[x.model]
        pages.append({
            "kind": "eq", "cat": "X-RAY SYSTEM", "brand": "DRGEM", "model": x.model, "sub": spec["sub"],
            "desc_line": spec["desc_line"],
            "include": catalog.xray_include(x.model, x.detector_count, x.detector_type, x.table),
            "price": x.price, "tradein": x.tradein, "warranty": "3 YEAR",
            "options": [(catalog.XRAY_OPTIONS[o.key], o.price)
                        for o in sorted(x.options, key=lambda o: list(catalog.XRAY_OPTIONS).index(o.key))],
            "img": spec["img"],
        })
    if items.pacs:
        pages.append({"kind": "pacs", "cat": "X-RAY SYSTEM", "label": "PACS", **catalog.PACS, "price": items.pacs.price})

    for r in _ordered(items.mammo, catalog.MAMMO_MODELS):
        spec = catalog.MAMMO_MODELS[r.model]
        pages.append({"kind": "eq", "cat": "MAMMOGRAPHY", "model": r.model, "price": r.price, "tradein": r.tradein,
                      "warranty": "3년", "options": [], **spec})

    for r in _ordered(items.carm, catalog.CARM_MODELS):
        spec = catalog.CARM_MODELS[r.model]
        pages.append({"kind": "eq", "cat": "C-ARM", "brand": "GENORAY", "model": r.model, "price": r.price,
                      "tradein": r.tradein, "warranty": catalog.CARM_WARRANTY, "include": catalog.CARM_INCLUDE,
                      "note": catalog.CARM_NOTE, "options": [], **spec})
    if items.carm_table:
        t = catalog.CARM_TABLES[items.carm_table]
        pages.append({"cat": "C-ARM", "label": f"전동테이블 · {t['brand']}", **t})
    if items.carm_reducer:
        pages.append({"kind": "seld", "cat": "C-ARM", "label": "저감장치", **catalog.SELD, "price": items.carm_reducer.price})

    for r in _ordered(items.bmd, catalog.BMD_MODELS):
        spec = catalog.BMD_MODELS[r.model]
        pages.append({"kind": "eq", "cat": "BMD", "brand": "OSTEOSYS", "model": r.model, "price": r.price,
                      "tradein": r.tradein, "warranty": "3년", "options": [], **spec})

    brand_order = list(catalog.US_BRANDS)
    for b in sorted(items.ultrasound, key=lambda b: brand_order.index(b.brand) if b.brand in brand_order else 99):
        models = catalog.US_BRANDS[b.brand]["models"]
        order = list(models)
        pages.append({"kind": "us", "cat": "ULTRASOUND", "brand": b.brand, "warranty": "3년", "models": [
            {"model": m.model, "price": m.price, **models[m.model]}
            for m in sorted(b.models, key=lambda m: order.index(m.model))]})

    rows = []
    for i, t in enumerate(items.therapy, start=1):
        s = t.snapshot or {}
        rows.append({"no": i, "name": s.get("name", ""), "maker": s.get("maker") or "", "model": s.get("model") or "",
                     "note": s.get("note") or "", "warranty": s.get("warranty") or "", "image_key": s.get("image_key"),
                     "unit": t.unit_price, "qty": t.qty, "amount": t.unit_price * t.qty})
    chunks = [rows[i:i + RX_PER_PAGE] for i in range(0, len(rows), RX_PER_PAGE)]
    for n, chunk in enumerate(chunks, start=1):
        pages.append({"kind": "rx", "cat": "치료장비", "rows": chunk, "page_no": n, "page_cnt": len(chunks)})

    pages += [{"kind": "why"}, {"kind": "thx"}]
    return pages
