"""심평원 분류 표시용 제조사 규칙 (app/brand_map.py — 허가번호 → 회사, 표기 묶기, 모델 전파)."""
from collections import Counter

from app.brand_map import company_display, license_company, model_key, propagate


# (entrps, manuf_nm, product, permit_date, changed_date)
def permit(entrps=None, manuf=None, product="개인용저주파자극기", date="20200101", changed=None):
    return (entrps, manuf, product, date, changed)


# ── 회사 표기 묶기 ────────────────────────────────────────────────────────────

def test_alias_maps_onto_existing_erp_spellings():
    # 레거시 6분류에 이미 있는 표기를 그대로 쓴다 (한글 법인명·영문 제조원 모두)
    assert company_display("(주)디알젬") == "DRGEM"
    assert company_display("지멘스헬시니어스(주)") == "Siemens Healthineers"
    assert company_display("Siemens Healthineers AG") == "Siemens Healthineers"
    assert company_display("삼성메디슨(주)") == "Samsung Medison"
    assert company_display("GE Medical systems (China) Co., Ltd.") == "GE Healthcare"
    assert company_display("(주)디케이메디칼시스템") == "DK메디칼시스템"
    # GE 법인(마취기) — ERP 가 GE 로 보여 오던 행이 다른 이름으로 바뀌지 않게
    assert company_display("Datex-Ohmeda, Inc.") == "GE Healthcare"


def test_alias_merges_factory_spellings_of_one_company():
    for raw in ("Aizu Olympus Co., Ltd", "AIZU Olympus Co.,Ltd(일본)", "Olympus Winter & Ibe GmbH"):
        assert company_display(raw) == "Olympus"
    assert company_display("(주) 바텍") == company_display("(주)바텍") == "바텍"


def test_alias_keeps_different_companies_apart():
    # 이름이 비슷해도 다른 회사는 묶지 않는다
    assert company_display("STORZ MEDICAL AG") == "Storz Medical"
    assert company_display("KARL STORZ SE & Co. KG") == "Karl Storz"
    # 영문 낱말은 앞이 글자면 안 맞는다 ('alcon' ⊂ 'Falcon')
    assert company_display("Falcon Co., Ltd.") == "Falcon"
    assert company_display("콘바텍코리아(유)") == "콘바텍코리아"          # ConvaTec ≠ 바텍
    assert company_display("SIEMENS MEDICAL INSTRUMENTS") == "SIEMENS MEDICAL INSTRUMENTS"  # 보청기


def test_unknown_company_only_loses_legal_form():
    assert company_display("주식회사 굿닥터스") == "굿닥터스"
    assert company_display("HOMER ION LABORATORY CO., LTD") == "HOMER ION LABORATORY"
    assert company_display("Hamilton Medical AG") == "Hamilton Medical"


def test_garbage_name_is_none():
    assert company_display("(") is None
    assert company_display("") is None
    assert company_display(None) is None


# ── 허가번호 → 회사 ───────────────────────────────────────────────────────────

def test_domestic_permit_uses_permit_holder():
    got = license_company("제허15-123호", [permit(entrps="(주)스트라텍", manuf=None)])
    assert got == ("스트라텍", False)


def test_import_permit_uses_foreign_manufacturer_not_importer():
    got = license_company("수허13-302호", [permit(entrps="한국올림푸스(주)", manuf="Aizu Olympus Co., Ltd")])
    assert got == ("Olympus", False)
    # 수입 허가에 제조원이 없으면 수입사를 제조사로 쓰지 않는다
    assert license_company("수인10-1호", [permit(entrps="수입상(주)", manuf=None)]) is None


def test_overlapping_old_license_with_two_companies_is_unusable():
    # 1990년대 번호는 지방청 접두어를 떼면 여러 회사가 겹친다 — 정할 수 없으면 None
    rows = [permit(entrps="(주)고려아이텍"), permit(entrps="(주)인포피아")]
    assert license_company("제허96-1호", rows) is None


def test_same_company_spelled_differently_is_still_one_company():
    rows = [permit(entrps="(주)디알젬", date="20100101"), permit(entrps="디알젬 주식회사", date="20200101")]
    assert license_company("제허10-1호", rows) == ("DRGEM", False)


def test_component_permit_is_flagged_by_latest_row():
    rows = [permit(entrps="(주)레이언스", product="디지털 엑스선 디텍터")]
    assert license_company("제허12-9호", rows) == ("레이언스", True)
    rows = [permit(entrps="(주)레이언스", product="진단용 엑스선 장치", date="20100101"),
            permit(entrps="(주)레이언스", product="엑스선 검출기", date="20200101")]
    assert license_company("제허12-9호", rows)[1] is True


def test_empty_inputs():
    assert license_company("", [permit(entrps="A")]) is None
    assert license_company("제허1-1호", []) is None


# ── 모델 전파 ────────────────────────────────────────────────────────────────

def test_propagation_needs_95_percent_of_units():
    k = model_key("C108", "IF-3000")
    assert propagate({k: Counter({"스트라텍": 95, "기타": 5})}) == {k: "스트라텍"}
    assert propagate({k: Counter({"스트라텍": 94, "기타": 6})}) == {}


def test_propagation_key_folds_case_space_hyphen_but_not_category():
    assert model_key("C108", "IF 3000") == model_key("C108", "if-3000")
    assert model_key("C108", "IF-3000") != model_key("C101", "IF-3000")


def test_propagation_skips_empty_model_key():
    assert propagate({model_key("C108", "  - "): Counter({"A": 10})}) == {}


def test_korean_subsidiary_names_join_their_brand():
    assert company_display("한국후지필름(주)") == "Fujifilm"
    assert company_display("한국필립스 주식회사") == "Philips"
    assert company_display("한국올림푸스") == "Olympus"
    assert company_display("콘바텍코리아") != "바텍"   # 앞이 한국이 아닌 한글이면 여전히 안 붙는다


def test_license_without_origin_prefix_prefers_foreign_maker():
    # 인22-·신·허 단독 번호는 앞글자로 국산·수입을 모른다 → 제조원이 적혀 있으면 제조원, 없으면 허가 업체
    imported = [("(주)수입사", "Siemens Healthcare GmbH", "자기공명전산화단층촬영장치", "2022-01-01", None)]
    assert license_company("인22-123호", imported) == ("Siemens Healthineers", False)
    domestic = [("(주)디알젬", None, "엑스선촬영장치", "2022-01-01", None)]
    assert license_company("인22-124호", domestic) == ("DRGEM", False)
    assert license_company("제인22-1호", imported) == ("수입사", False)      # 제조 허가는 허가 업체
    assert license_company("수인22-1호", imported) == ("Siemens Healthineers", False)


def test_coverage_table_survives_empty_year(capsys):
    import importlib.util
    import pathlib
    import sqlite3

    spec = importlib.util.spec_from_file_location("apply_brand", pathlib.Path(__file__).parents[1] / "scripts" / "apply_brand.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE equipment (category TEXT, category_name TEXT, eq_count INT, brand TEXT, year INT)")
    conn.execute("INSERT INTO equipment VALUES ('C108', '저주파', 0, NULL, 2024)")
    mod.coverage_table(conn, {}, 2024, 5)   # 대수 0 / 6분류 밖 없음에서도 0으로 나누지 않는다
    mod.coverage_table(conn, {}, 2019, 5)
    assert "0.0%" in capsys.readouterr().out


def test_factory_branch_and_dba_suffixes_are_cut_after_legal_form():
    assert company_display("Toray Medical Co., Ltd. Shizuoka Plant") == "Toray Medical"
    assert company_display("Natus Medical Inc. DBA Excel-Tech") == company_display("Natus Medical Incorporated DBA Excel-Tech") == "Natus Medical"
    assert company_display("Kowa company Ltd.Chofu Factory") == "Kowa"
    assert company_display("(제조자)ITO CO., LTD. (본사)ITO") == "ITO"
    assert company_display("Leica Instruments(Singapore) Pte.Ltd.") == "Leica Instruments(Singapore)"
    # 법인 낱말로 시작하는 이름·낱말 일부는 자르지 않는다
    assert company_display("Incheon Medical") == "Incheon Medical"
    assert company_display("Corpus Medical") == "Corpus Medical"
    assert company_display("Limited Edition Medical") == "Limited Edition Medical"


def test_cut_never_leaves_an_open_bracket():
    assert company_display("Arrow International (Subsidiary of Teleflex, Incorporated)") == "Arrow International"
    assert company_display("Nellcor Puritan Bennett Ireland(A subsidiary of Mallinkrodt Inc)") == "Nellcor Puritan Bennett Ireland"
