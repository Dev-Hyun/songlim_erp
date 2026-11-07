"""고른 장비(items) → PDF 페이지 목록. 순수 함수라 DB·템플릿 없이 테스트한다.

페이지 순서: 표지 → 회사 소개 → X-RAY(모델들 → PACS) → C-ARM(모델들 → 전동테이블 → 저감장치) → MAMMOGRAPHY
→ BMD → ULTRASOUND(브랜드당 1장) → 기타장비(LIPUS → ESWT(한 장에 4대까지) → 근전도) → 치료장비(8줄씩)
→ 함께 하는 이유 → 마지막 장.
카테고리 안의 순서는 카탈로그 순서를 따른다(입력 순서와 무관하게 늘 같은 제안서 모양).
"""
from . import catalog
from .schemas import ProposalItems

RX_PER_PAGE = 8
ESWT_PER_PAGE = 4
ETC = "기타장비"  # 표지 '제안 품목'에서 LIPUS·ESWT·근전도를 한 줄로 묶는 이름


def _ordered(rows, table: dict):
    order = {m: i for i, m in enumerate(table)}
    return sorted(rows, key=lambda r: order.get(r.model, len(order)))


def _even_split(rows: list, per: int) -> list[list]:
    """per개씩 끊되 장마다 고르게: 5대 → 3+2, 8대 → 4+4, 9대 → 3+3+3."""
    if not rows:
        return []
    n = -(-len(rows) // per)
    base, extra = divmod(len(rows), n)
    out, i = [], 0
    for k in range(n):
        size = base + (1 if k < extra else 0)
        out.append(rows[i:i + size])
        i += size
    return out


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

    for r in _ordered(items.mammo, catalog.MAMMO_MODELS):
        spec = catalog.MAMMO_MODELS[r.model]
        pages.append({"kind": "eq", "cat": "MAMMOGRAPHY", "model": r.model, "price": r.price, "tradein": r.tradein,
                      "warranty": "3년", "options": [], **spec})

    for r in _ordered(items.bmd, catalog.BMD_MODELS):
        spec = catalog.BMD_MODELS[r.model]
        pages.append({"kind": "eq", "cat": "BMD", "brand": "OSTEOSYS", "model": r.model, "price": r.price,
                      "tradein": r.tradein, "warranty": "3년", "options": [], **spec})

    brand_order = list(catalog.US_BRANDS)
    for b in sorted(items.ultrasound, key=lambda b: brand_order.index(b.brand) if b.brand in brand_order else 99):
        models = catalog.US_BRANDS[b.brand]["models"]
        order = list(models)
        pages.append({"kind": "us", "cat": "ULTRASOUND", "title": b.brand, "toc": [b.brand], "warranty": "3년", "models": [
            {"model": m.model, "price": m.price, "include": f"Main Body + **{m.probes} Probe**", **models[m.model]}
            for m in sorted(b.models, key=lambda m: order.index(m.model))]})

    for r in _ordered(items.lipus, catalog.LIPUS_MODELS):
        spec = catalog.LIPUS_MODELS[r.model]
        # 기존 제안서에 보증 기간이 없어 Warranty 줄은 넣지 않는다
        pages.append({"kind": "eq", "cat": f"{ETC} · LIPUS", "group": ETC, "model": r.model, "price": r.price,
                      "tradein": r.tradein, "warranty": None, "options": [], **spec})

    # ESWT: 브랜드가 섞이므로 칸마다 브랜드를 적는다. Warranty 없음(New.md).
    eswt = [{"model": r.model, "price": r.price, **catalog.ESWT_MODELS[r.model]}
            for r in _ordered(items.eswt, catalog.ESWT_MODELS)]
    chunks = _even_split(eswt, ESWT_PER_PAGE)
    for n, chunk in enumerate(chunks, start=1):
        pages.append({"kind": "us", "cat": f"{ETC} · ESWT", "group": ETC, "title": "체외충격파", "warranty": None,
                      "toc": [m["model"] for m in chunk], "models": chunk, "page_no": n, "page_cnt": len(chunks)})

    for r in _ordered(items.emg, catalog.EMG_MODELS):
        spec = catalog.EMG_MODELS[r.model]
        pages.append({"kind": "eq", "cat": f"{ETC} · 근전도", "group": ETC, "model": r.model, "price": r.price,
                      "tradein": r.tradein, "warranty": "3년", "options": [], **spec})

    rows = []
    for i, t in enumerate(items.therapy, start=1):
        s = t.snapshot or {}
        rows.append({"no": i, "name": s.get("name", ""), "maker": s.get("maker") or "", "model": s.get("model") or "",
                     "note": s.get("note") or "", "warranty": s.get("warranty") or "", "image_key": s.get("image_key"),
                     "unit": t.unit_price, "qty": t.qty, "amount": t.unit_price * t.qty})
    # 한 장에 8줄 고정(품목이 계속 늘어나므로) — 마지막 장만 남은 줄
    chunks = [rows[i:i + RX_PER_PAGE] for i in range(0, len(rows), RX_PER_PAGE)]
    for n, chunk in enumerate(chunks, start=1):
        pages.append({"kind": "rx", "cat": "치료장비", "rows": chunk, "page_no": n, "page_cnt": len(chunks)})

    pages += [{"kind": "why"}, {"kind": "thx"}]
    return pages
