"""제안서 페이지 조립·입력 검증·렌더링 — DB 없이 도는 순수 로직 테스트."""
import pytest

from app.proposal.pages import build_pages
from app.proposal.schemas import ProposalItems, validate_items


def _items(**kw) -> ProposalItems:
    return ProposalItems.model_validate(kw)


def _therapy(n: int) -> list[dict]:
    return [{"item_id": i + 1, "unit_price": 1000 * (i + 1), "qty": 2 if i == 0 else 1,
             "snapshot": {"name": f"품목{i + 1}", "maker": "", "model": f"M{i + 1}", "note": "", "warranty": "", "image_key": None}}
            for i in range(n)]


FULL = dict(
    xray=[{"model": "GXR-E40S Plus", "detector_count": 1, "price": 28980000},
          {"model": "GXR-52SD", "detector_count": 2, "detector_type": "LUMEN 17X17", "table": "PBT-6", "price": 52800000,
           "options": [{"key": "capacitor", "price": 2500000}]}],
    pacs={"price": 2000000},
    mammo=[{"model": "PINKVIEW BT", "price": 43000000}],
    carm=[{"model": "ZEN-2090 TURBO", "price": 42500000}],
    carm_table="01M",
    carm_reducer={"price": 4500000},
    bmd=[{"model": "PRIMUS", "price": 44000000}],
    ultrasound=[{"brand": "ALPINION", "models": [{"model": "X-CUBE 50", "price": 1, "probes": 3}]},
                {"brand": "DRGEM", "models": [{"model": "DS30", "price": 2}, {"model": "DS20", "price": 3}]}],
    emg=[{"model": "Keypoint Focus", "price": 25000000}],
    therapy=_therapy(17),
)


def test_page_order_follows_category_order():
    pages = build_pages(_items(**FULL))
    kinds = [p["kind"] for p in pages]
    # X-RAY → C-ARM → MAMMO → BMD → ULTRASOUND → 근전도 → 치료장비
    cats = [p.get("cat") for p in pages]
    assert cats == [None, None, "X-RAY SYSTEM", "X-RAY SYSTEM", "X-RAY SYSTEM", "C-ARM", "C-ARM", "C-ARM",
                    "MAMMOGRAPHY", "BMD", "ULTRASOUND", "ULTRASOUND", "기타장비 · 근전도", "치료장비", "치료장비", "치료장비", None, None]
    assert kinds == ["cover", "intro", "eq", "eq", "pacs", "eq", "x3c", "seld", "eq", "eq", "us", "us",
                     "eq", "rx", "rx", "rx", "why", "thx"]
    # 초음파 브랜드는 카탈로그 순서(DRGEM → ALPINION), 브랜드 안 모델도 카탈로그 순서
    us = [p for p in pages if p["kind"] == "us"]
    assert [p["title"] for p in us] == ["DRGEM", "ALPINION"]
    assert [m["model"] for m in us[0]["models"]] == ["DS20", "DS30"]


def test_therapy_split_eight_per_page_without_total():
    rx = [p for p in build_pages(_items(**FULL)) if p["kind"] == "rx"]
    assert [len(p["rows"]) for p in rx] == [8, 8, 1]  # 8줄 고정
    assert [r["no"] for r in rx[1]["rows"]][0] == 9
    assert all("total" not in p for p in rx)
    first = rx[0]["rows"][0]
    assert first["amount"] == 2000 and first["qty"] == 2


def test_xray_include_text_and_options():
    eqs = [p for p in build_pages(_items(**FULL)) if p["kind"] == "eq"]
    e40, sd = eqs[0], eqs[1]
    assert "Detector **1EA** (MANO 17 X 17)" in e40["include"]
    assert sd["include"][1] == "DETECTOR **2EA** (LUMEN 17X17)"
    assert sd["include"][2] == "TABLE : PBT-6"
    assert sd["options"] == [("Capacitor", 2500000)]
    assert sd["warranty"] == "3 YEAR"


def test_carm_page_has_fixed_include_warranty_and_note():
    carm = [p for p in build_pages(_items(**FULL)) if p.get("cat") == "C-ARM" and p["kind"] == "eq"][0]
    assert carm["include"][-1] == "**전동테이블 포함**"
    assert carm["warranty"].startswith("3년 (단, TUBE")
    assert carm["note"]["title"] == "송림메디칼 차별화 서비스"


def test_pinkview_has_detector_box():
    mammo = [p for p in build_pages(_items(**FULL)) if p.get("cat") == "MAMMOGRAPHY"][0]
    assert mammo["det"]["name"] == "RSM 1824C"


def test_hck_table_and_no_extras_when_not_selected():
    pages = build_pages(_items(carm=[{"model": "OSCAR 15", "price": 1}], carm_table="HCK"))
    assert [p["kind"] for p in pages] == ["cover", "intro", "eq", "hck", "why", "thx"]


@pytest.mark.parametrize("bad, msg", [
    ({"xray": [{"model": "GXR-99", "price": 1}]}, "GXR-99"),
    ({"xray": [{"model": "GXR-52SD", "price": 1}]}, "Detector 종류"),
    ({"xray": [{"model": "GXR-52SD", "detector_type": "MANO 17x17", "table": "PBT-9", "price": 1}]}, "Table"),
    ({"xray": [{"model": "GXR-E40S Plus", "price": 1, "options": [{"key": "nope", "price": 1}]}]}, "nope"),
    ({"mammo": [{"model": "AIDIA X", "price": 1}]}, "AIDIA X"),
    ({"emg": [{"model": "Cadwell", "price": 1}]}, "Cadwell"),
    ({"ultrasound": [{"brand": "SAMSUNG MEDISON", "models": [{"model": "X-CUBE 50", "price": 1}]}]}, "X-CUBE 50"),
    ({"ultrasound": [{"brand": "DRGEM", "models": [{"model": "DS20", "price": 1}]},
                     {"brand": "DRGEM", "models": [{"model": "DS30", "price": 1}]}]}, "DRGEM"),
])
def test_validate_items_rejects_unknown_catalog_entries(bad, msg):
    errors = validate_items(_items(**bad))
    assert errors and any(msg in e for e in errors)


def test_validate_items_accepts_full_selection():
    assert validate_items(_items(**FULL)) == []


def test_price_must_be_positive():
    with pytest.raises(Exception):
        _items(mammo=[{"model": "AIDIA UD", "price": 0}])


# ---------- 렌더링 ----------
from app.proposal.render import render_html  # noqa: E402

META = {"hospital_name": "세종드림<script>내과", "doctor_name": "김민수", "proposal_date": "2026-11-07",
        "rep_name": "이정호", "rep_title": "상무", "rep_phone": "010-6426-7469"}


@pytest.mark.parametrize("design, cls", [("A", "sheet dA"), ("C", "sheet dC")])
def test_render_has_one_sheet_per_page_and_escapes_input(design, cls):
    pages = build_pages(_items(**FULL))
    html = render_html({**META, "design": design}, pages, asset_base="http://x/static/", upload_base="http://x/up/")
    assert html.count(f'class="{cls}') == len(pages)
    assert "세종드림&lt;script&gt;내과" in html and "<script>내과" not in html
    assert "김민수" in html and "010-6426-7469" in html
    assert '<b class="hl">2EA</b>' in html
    assert "<tfoot" not in html  # 치료장비 합계 줄 없음
    assert "http://x/static/img/sd.png" in html
    assert "C-arm 견적에 포함" in html  # 01M 전동테이블


def test_render_therapy_image_sources():
    items = _items(therapy=[
        {"item_id": 1, "unit_price": 1, "qty": 1, "snapshot": {"name": "a", "image_key": "seed/01.png"}},
        {"item_id": 2, "unit_price": 1, "qty": 3, "snapshot": {"name": "b", "image_key": "up/abc.png", "note": "1) x\n2) **y**"}},
    ])
    html = render_html({**META, "design": "A"}, build_pages(items), asset_base="S/", upload_base="U/")
    assert 'src="S/therapy/01.png"' in html and 'src="U/abc.png"' in html
    assert '1) x<br>2) <b class="hl">y</b>' in html
    assert '<td class="hl">3</td>' in html


def test_price_memory_keys():
    from app.proposal.schemas import price_memory

    mem = price_memory(_items(**FULL))
    assert mem["xray:GXR-52SD"] == (52800000, None)
    assert mem["xray_opt:capacitor"] == (2500000, None)
    assert mem["pacs:VIEWREX 3"] == (2000000, None) and mem["carm_reducer"] == (4500000, None)  # 예전 {price}만 = ViewRex3
    assert mem["us:DRGEM:DS30"] == (2, 2)  # Probe 기본 2개가 수량 칸에 남는다
    assert mem["us:ALPINION:X-CUBE 50"] == (1, 3)
    assert mem["emg:Keypoint Focus"] == (25000000, None)
    assert mem["therapy:1"] == (1000, 2)


def test_ultrasound_probe_count_in_include():
    us = [p for p in build_pages(_items(**FULL)) if p["kind"] == "us"]
    alp = [p for p in us if p["title"] == "ALPINION"][0]
    assert alp["models"][0]["include"] == "Main Body + **3 Probe**"
    drgem = [p for p in us if p["title"] == "DRGEM"][0]
    assert drgem["models"][0]["include"] == "Main Body + **2 Probe**"  # 안 적으면 2개
    html = render_html({**META, "design": "C"}, build_pages(_items(**FULL)), asset_base="S/", upload_base="U/")
    assert 'INCLUDE · Main Body + <b class="hl">3 Probe</b>' in html
    assert 'class="opts opts-2col"' not in html and 'class="opts "' in html  # 옵션 1개면 1단


def test_many_xray_options_use_two_columns():
    from app.proposal import catalog
    opts = [{"key": k, "price": 1} for k in catalog.XRAY_OPTIONS]
    html = render_html({**META, "design": "A"}, build_pages(_items(xray=[{"model": "GXR-E40S Plus", "price": 1, "options": opts}])),
                       asset_base="S/", upload_base="U/")
    assert 'class="opts opts-2col"' in html


def test_etc_equipment_order_eswt_split_and_no_warranty():
    from app.proposal import catalog
    eswt = [{"model": m, "price": 1} for m in reversed(list(catalog.ESWT_MODELS))]  # 입력 순서와 무관
    pages = build_pages(_items(lipus=[{"model": "CELLABONE", "price": 9900000}], eswt=eswt[:5],
                               emg=[{"model": "Keypoint Focus", "price": 1}], therapy=_therapy(1)))
    cats = [p.get("cat") for p in pages]
    assert cats[2:7] == ["기타장비 · LIPUS", "기타장비 · ESWT", "기타장비 · ESWT", "기타장비 · 근전도", "치료장비"]
    es = [p for p in pages if p.get("cat") == "기타장비 · ESWT"]
    assert [len(p["models"]) for p in es] == [3, 2]  # 5대 → 3+2
    assert [p["page_no"] for p in es] == [1, 2] and es[0]["page_cnt"] == 2
    picked = [m["model"] for p in es for m in p["models"]]
    assert picked == [m for m in catalog.ESWT_MODELS if m in picked]  # 카탈로그 순서
    assert all(p["warranty"] is None for p in es) and pages[2]["warranty"] is None  # ESWT·LIPUS는 Warranty 없음
    html = render_html({**META, "design": "A"}, pages, asset_base="S/", upload_base="U/")
    assert html.count("WARRANTY") == 1  # 근전도만
    assert "기타장비 <span>CELLABONE 외 6</span>" in html  # 표지 목차는 기타장비 한 줄


def test_eight_eswt_make_two_pages_of_four():
    from app.proposal import catalog
    es = [p for p in build_pages(_items(eswt=[{"model": m, "price": 1} for m in list(catalog.ESWT_MODELS)[:8]]))
          if p.get("cat") == "기타장비 · ESWT"]
    assert [len(p["models"]) for p in es] == [4, 4]
    es9 = [p for p in build_pages(_items(eswt=[{"model": m, "price": 1} for m in catalog.ESWT_MODELS]))
           if p.get("cat") == "기타장비 · ESWT"]
    assert len(catalog.ESWT_MODELS) == 9 and [len(p["models"]) for p in es9] == [3, 3, 3]


def test_recipient_written_as_is_with_particle():
    from app.proposal.render import eul
    assert eul("김민수 원장님") == "을" and eul("충남대학교") == "를" and eul("Dr. Kim") == "을"
    for d in "AC":
        html = render_html({**META, "doctor_name": "이영희 실장님", "design": d}, build_pages(_items()),
                           asset_base="S/", upload_base="U/")
        assert "이영희 실장님" in html and "원장님" not in html


def test_mct_pages_after_carm_before_mammo_in_catalog_order():
    from app.proposal import catalog
    from app.proposal.render import STATIC_DIR

    pages = build_pages(_items(carm=[{"model": "ZEN-2090 TURBO", "price": 1}],
                               mct=[{"model": "SMART M PLUS", "price": 3}, {"model": "SMART M", "price": 2}],
                               mammo=[{"model": "AIDIA LUXE", "price": 4}]))
    assert [(p.get("cat"), p.get("model")) for p in pages[2:5]] == [
        ("C-ARM", "ZEN-2090 TURBO"), ("MCT", "SMART M"), ("MCT", "SMART M PLUS")]
    assert pages[5]["cat"] == "MAMMOGRAPHY"
    mct = [p for p in pages if p.get("cat") == "MCT"]
    assert all(p["kind"] == "eq" and p["brand"] == "VATECH" and len(p["desc"]) == 4 for p in mct)
    assert all((STATIC_DIR / v["img"]).is_file() for v in catalog.MCT_MODELS.values())
    assert validate_items(_items(mct=[{"model": "SMART X", "price": 1}])) == ["MCT 모델 없음: SMART X"]


def test_raymo_three_pages_after_xray_before_pacs_counted_once_in_toc():
    from app.proposal.render import _toc

    pages = build_pages(_items(xray=[{"model": "GXR-E40S Plus", "detector_count": 1, "price": 1}],
                               xray_mobile=[{"model": "RAYMO", "price": 65000000}], pacs={"price": 2}))
    assert [(p["kind"], p.get("part")) for p in pages[2:7]] == [
        ("eq", None), ("mdr", 1), ("mdr", 2), ("mdr", 3), ("pacs", None)]
    assert all(p["brand"] == "DRGEM" and p["price"] == 65000000 and "options" not in p for p in pages[3:6])
    assert _toc(pages)[0] == ("X-RAY SYSTEM", "GXR-E40S Plus 외 1")
    assert validate_items(_items(xray_mobile=[{"model": "RAYMO 2", "price": 1}])) == ["X-RAY 이동형 모델 없음: RAYMO 2"]
    from app.proposal import catalog
    from app.proposal.render import STATIC_DIR
    r = catalog.XRAY_MOBILE_MODELS["RAYMO"]
    imgs = [r["hero"], r["monitor"][0], r["panel"][0]] + [src for src, _ in r["photos"]]
    assert all((STATIC_DIR / x).is_file() for x in imgs)


def test_raymo_and_mct_render_in_both_designs_without_smart_control():
    from app.proposal.render import STATIC_DIR, render_html

    items = _items(xray_mobile=[{"model": "RAYMO", "price": 65000000}], mct=[{"model": "SMART M", "price": 1}])
    meta = {"hospital_name": "병원", "doctor_name": "홍길동 원장님", "proposal_date": "2026-11-12",
            "rep_name": "", "rep_title": "", "rep_phone": ""}
    for d in "AC":
        html = render_html({**meta, "design": d}, build_pages(items), asset_base=STATIC_DIR.as_uri() + "/", upload_base="")
        assert html.count('class="md-h"') == 2 and "md1" in html  # 3장: 소개 + 머리글 있는 2장
        assert "RADMAX M" not in html and "SMART CONTROL" not in html  # 국내 미출시
        assert "SMART M" in html and "65,000,000" in html


def test_pacs_pick_one_of_three_and_copy_only_for_viewrex():
    from app.proposal import catalog
    from app.proposal.render import STATIC_DIR, render_html

    old = [p for p in build_pages(_items(pacs={"price": 2})) if p["kind"] == "pacs"][0]
    assert old["model"] == "VIEWREX 3" and old["title"] == "ViewRex3"   # 예전 제안서
    meta = {"hospital_name": "병원", "doctor_name": "홍길동 원장님", "proposal_date": "2026-11-13",
            "rep_name": "", "rep_title": "", "rep_phone": ""}
    for model, title in (("UBPACS-Z", "UBPACS-Z"), ("GEMPACS", "GEMPACS")):
        pg = [p for p in build_pages(_items(pacs={"model": model, "price": 3})) if p["kind"] == "pacs"][0]
        assert pg["title"] == title and "desc" not in pg
        for d in "AC":
            html = render_html({**meta, "design": d}, build_pages(_items(pacs={"model": model, "price": 3})),
                               asset_base=STATIC_DIR.as_uri() + "/", upload_base="")
            assert f'<div class="h40">{title}</div>' in html and "Copy" not in html and "ViewRex3" not in html
    for v in catalog.PACS_MODELS.values():
        assert all((STATIC_DIR / x).is_file() for x in v["imgs"])
        assert len(v["lead"]) == 2 and len(v["feats"]) == 8   # 세 PACS 모두 같은 모양
    assert validate_items(_items(pacs={"model": "OTHER", "price": 1})) == ["PACS 모델 없음: OTHER"]


def test_carm_genoray_then_drtech_with_brand_and_warranty():
    from app.proposal import catalog
    from app.proposal.render import STATIC_DIR

    pages = build_pages(_items(carm=[{"model": "EXTRON 7", "price": 2}, {"model": "OSCAR PRIME", "price": 1},
                                     {"model": "EXTRON 3", "price": 3}]))
    eq = [p for p in pages if p.get("cat") == "C-ARM"]
    assert [(p["brand"], p["model"]) for p in eq] == [("GENORAY", "OSCAR PRIME"), ("DRTECH", "EXTRON 3"), ("DRTECH", "EXTRON 7")]
    assert eq[0]["warranty"] == "3년 (단, TUBE · I.I. · Detector는 2년)" and eq[1]["warranty"] == "3년"
    # 보증은 직접 입력하면 그 값
    typed = build_pages(_items(carm=[{"model": "EXTRON 5", "price": 1, "warranty": "5년 (무상점검 포함)"}]))
    assert [p["warranty"] for p in typed if p.get("cat") == "C-ARM"] == ["5년 (무상점검 포함)"]
    assert all((STATIC_DIR / v["img"]).is_file() for v in catalog.CARM_MODELS.values())


def test_mobile_dr_raymo_and_promo_with_detectors():
    from app.proposal import catalog
    from app.proposal.render import STATIC_DIR, render_html

    items = _items(xray_mobile=[
        {"model": "PROMO", "price": 2, "detectors": [{"size": "성인용", "type": "LUMEN"}, {"size": "성인용", "type": "LUMEN"},
                                                     {"size": "소아용", "type": "Mano"}]},
        {"model": "RAYMO", "price": 1, "detectors": [{"size": "소아용", "type": "H&abyz"}]}])
    pages = [p for p in build_pages(items) if p["kind"] == "mdr"]
    assert [(p["model"], p["part"]) for p in pages] == [("RAYMO", 1), ("RAYMO", 2), ("RAYMO", 3), ("PROMO", 1), ("PROMO", 2), ("PROMO", 3)]
    assert dict(pages[3]["spec"])["디텍터"] == "성인용 LUMEN ×2 · 소아용 Mano"
    assert dict(pages[0]["spec"])["디텍터"] == "소아용 H&abyz"
    # 디텍터를 안 고른 예전 제안서는 카탈로그 문구 그대로
    assert dict(build_pages(_items(xray_mobile=[{"model": "RAYMO", "price": 1}]))[2]["spec"])["디텍터"] == "무선 평판 디텍터 · 듀얼 디텍터 지원"
    assert validate_items(_items(xray_mobile=[{"model": "PROMO", "price": 1, "detectors": [{"size": "성인용", "type": ""}]}])) == [
        "PROMO: 디텍터 크기·종류를 선택하세요"]
    for v in catalog.XRAY_MOBILE_MODELS.values():
        imgs = [v["hero"], v["monitor"][0], v["panel"][0]] + [src for src, _ in v["photos"]]
        assert all((STATIC_DIR / x).is_file() for x in imgs)
    meta = {"hospital_name": "병원", "doctor_name": "홍길동 원장님", "proposal_date": "2026-11-13",
            "rep_name": "", "rep_title": "", "rep_phone": ""}
    for d in "AC":
        html = render_html({**meta, "design": d}, build_pages(items), asset_base=STATIC_DIR.as_uri() + "/", upload_base="")
        assert "쉽게 밀고, 높게 닿고" in html and "RFID 사용자 인식" in html and "성인용 LUMEN ×2" in html
        assert "H&amp;abyz" in html   # 자동 이스케이프
