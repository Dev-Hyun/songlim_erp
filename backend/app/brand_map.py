"""모델명 → **시장 브랜드** 손수 관리 표 (레거시 6분류 전용).

왜 필요한가:
  식약처 품목허가가 알려주는 `maker_name`은 **제조원**이고 `client_name`이 **수입·판매 명의자**,
  즉 시장에 나가는 브랜드다. 영업에 쓸모 있는 쪽은 브랜드다.
  예) `GM85` — maker `(주)디알텍`, client `삼성전자(주)` → 브랜드는 **Samsung**.
      `Discovery Ci` — maker `Flextronics`(위탁생산), client `Hologic, Inc` → 브랜드는 **Hologic**.

  **다만 레거시 6분류(us/xray/carm/mri/bmd/ct, source='import')의 `manufacturer`는 이미
  브랜드로 정리돼 있다.** 2026-09-20 실측에서 식약처와 갈리는 237조합을 전수 확인한 결과,
  실제 업체명이 들어 있는 조합은 거의 전부 우리 값 = 식약처 `client_name`(브랜드) 쪽이었다.
  그래서 이 표는 **전량 재작성용이 아니라, 브랜드가 아닌 값이 들어간 소수 모델의 예외표**다.

키를 (분류, 모델명)으로 잡은 이유:
  - 제조사명 단독으로는 안 된다. 같은 업체가 모델에 따라 브랜드이기도 하고 아니기도 하다
    (`디알텍`은 EXSys에서는 브랜드 본인, GM85에서는 제조원).
  - 모델명 단독도 안 된다. 품목 계열이 다르면 같은 모델명이 다른 회사 제품이다
    (OsteoSys `PRIMUS`(골밀도) vs Dräger `Primus`(마취기)).
  - 실측: 6분류에서 (분류, 정규화 모델명) 한 조합에 실제 업체명이 2개 이상 걸리는 그룹은
    수천 개 중 1개뿐이다. 키로 충분히 유일하다.
  - 저장된 제조사명은 **키에 넣지 않는다.** 같은 모델이 `디알텍`/`기타`처럼 여러 표기로
    들어와 있어도 한 줄로 덮을 수 있어야 한다.

**추측하지 않는다.** 문자열 유사도·패턴 매칭으로 브랜드를 맞히는 코드는 쓰지 않는다
(그 방식은 2026-09-20에 오류로 확인돼 제거했다 — app/manufacturer_map.py 참고).
아래 표는 한 줄마다 식약처 허가번호를 근거로 달고 손으로 적는다. 근거를 못 다는 모델은
넣지 않는다 — 빼면 `manufacturer` 값이 그대로 쓰인다.

반영: backend/scripts/apply_brand.py

심평원 전체 분류(C108 등, 레거시 6분류 밖)는 파일 아래쪽 '허가번호로 표시용 제조사 정하기' 규칙을 쓴다.
"""
import re

_NON_WORD = re.compile(r"[^0-9a-z가-힣]")


def _key(category: str, model: str) -> tuple:
    """대소문자·공백·하이픈 차이만 흡수한다. 그 이상은 접지 않는다(= 추측 금지)."""
    return (category, _NON_WORD.sub("", (model or "").lower()))


# (분류, 모델명, 브랜드, 근거)
# 근거는 식약처 품목허가 번호와 그 허가의 maker/client 를 그대로 적는다.
BRAND_RULES = [
    # --- 우리 값이 다른 회사다 (브랜드도 제조원도 아님) -------------------------
    # SONIMAGE 는 코니카미놀타의 초음파 브랜드다. 레거시가 Canon 으로 붙여 놨다.
    ("us", "ULTRASOUND SYSTEM SONIMAGE HS1", "Konica Minolta",
     "수인15-4130호 maker=KONICA MINOLTA TECHNOPRODUCTS / client=KONICA MINOLTA, INC. (HS1외 1건)"),
    ("us", "ULTRASOUND SYSTEM SONIMAGE HS2", "Konica Minolta",
     "수인15-4130호 'ULTRASOUND SYSTEM SONIMAGE HS1외 1건'의 나머지 1건"),
    ("us", "ULTRASOUND SYSTEM SONIMAGE MX1", "Konica Minolta",
     "수인19-4359호 maker=KONICA MINOLTA TECHNOPRODUCTS / client=KONICA MINOLTA INC."),

    # FibroScan 530 Compact 은 Echosens 제품이다. 레거시가 국내 취급사(Alpinion)를 적어 놨다.
    # 같은 DB 안의 다른 FibroScan 행들은 이미 'Echosens' 로 들어와 있어 표기도 여기에 맞춘다.
    ("us", "530 Compact", "Echosens",
     "수인17-4689호 maker=ECHOSENS / client=Echosens ('530 Compact외 1건')"),

    # ALBIT 은 폴란드 ECHO-SON 제품. 허가에 Alpinion 은 어디에도 없다.
    ("us", "ALBIT", "ECHO-SON",
     "수인14-3377호 maker=ECHO-SON S.A. (client 없음)"),

    # MU125 는 시마즈 이동형 엑스선. 레거시 'CSE' 는 국내 취급사 표기로 보인다.
    ("xray", "MU125M", "Shimadzu", "수허98-151호 maker=client=SHIMADZU CORPORATION"),
    ("xray", "MU125P", "Shimadzu", "수허98-237호 maker=client=SHIMADZU CORPORATION"),

    # DRS-1000 은 리스템 명의의 허가다. 레거시 'GEMSS' 는 다른 회사다.
    ("xray", "DRS-1000", "LISTEM",
     "제인05-540호 maker=문창호 / client=(주)리스템"),

    # --- 회사가 인수돼 브랜드가 바뀐 것 -----------------------------------------
    # Volcano(IVUS)는 2015년 Philips 가 인수했다. 레거시 'Boston Scientific' 은 근거가 없다
    # (같은 IVUS라도 Boston Scientific 제품은 iLab 계열이고 그쪽은 허가 client 가 BSC 다).
    ("us", "Volcano s5 Imaging System", "Philips",
     "수허06-1102호 maker=client=Volcano Corporation (2015년 Philips 인수)"),
    ("us", "Volcano CORE Series s5 Imaging system", "Philips",
     "수허19-174호 maker=Volcano Corporation (2015년 Philips 인수)"),
    ("us", "Volcano S5i Intravascular Imaging System", "Philips",
     "수허11-745호 maker=client=Volcano Corporation (2015년 Philips 인수)"),
    ("us", "Volcano CORE Series Precision Guided Therapy System", "Philips",
     "수허19-173호 maker=Volcano Corporation (2015년 Philips 인수)"),
    # 레거시 'InVision' 은 회사명이 아니라 제품명(In-Vision Gold)이다. 허가 명의는 Volcano.
    ("us", "S7700906 (In-Vision Gold Imaging System)", "Philips",
     "수허03-1561호 maker=client=Volcano Corporation (2015년 Philips 인수)"),
]

# (분류, 정규화 모델명) -> (브랜드, 근거)
_INDEX = {_key(c, m): (b, why) for c, m, b, why in BRAND_RULES}
assert len(_INDEX) == len(BRAND_RULES), "BRAND_RULES에 같은 (분류, 모델명)이 두 번 있다"


def brand_of(category: str, model: str):
    """표에 있으면 브랜드, 없으면 None(= manufacturer 값을 그대로 브랜드로 본다)."""
    hit = _INDEX.get(_key(category, model))
    return hit[0] if hit else None


# 브랜드 우선 규칙이 적용되는 분류. sales_map.MANUAL_CATEGORIES 와 같은 6종이다.
# **이 밖의 분류는 manufacturer 가 제조원**이라 브랜드로 읽으면 안 된다.
BRAND_CATEGORIES = frozenset({"us", "xray", "carm", "mri", "bmd", "ct"})


def display_maker(category, brand, manufacturer):
    """그 행에 **표시할 제조사**. 6분류는 브랜드, 나머지는 제조원.

    equipment.brand 는 이 값을 미리 계산해 둔 칸이다(scripts/apply_brand.py 가 채운다).
    처음에는 '표가 바꾼 행만 non-NULL' 로 뒀는데, 그러면 조회마다 CASE 식이 필요해
    manufacturer 선두 커버링 인덱스(idx_eq_mfr_cover)가 죽는다 — 제조사 목록이 64ms 에서
    1.5초대로 돌아간다. 전 행에 채워 두면 질의는 `GROUP BY brand` 한 줄로 끝나고
    같은 모양의 인덱스(idx_eq_brand_cover)가 그대로 받아준다.
    manufacturer 는 원본 제조원 값으로 그대로 남아 있어 근거 추적이 가능하다.
    """
    if category in BRAND_CATEGORIES:
        return brand or manufacturer
    return manufacturer


def brand_expr():
    """조회에서 '표시할 제조사'로 쓸 컬럼.

    brand 가 전 행에 채워져 있으므로 그냥 그 칸이다. 화면마다 규칙을 되풀이하지 않도록
    이 이름으로만 접근한다(규칙이 바뀌면 여기와 apply_brand.py 두 곳만 고치면 된다).
    """
    from app.models.sales_map import Equipment

    return Equipment.brand


# ─── 심평원 전체 분류(C108 등) — 허가번호로 표시용 제조사 정하기 ─────────────────────
#
# 레거시 6분류 밖(source='hira_*'/'odcloud_*')의 brand 는 원래 manufacturer(식약처 MdeqPrdlst 의
# 제조원 MNSC_NM) 그대로였다. 그 API 는 국내 제조품의 업체명이 비어 있어, 국내 제조 장비가
# 대부분 제조사 없음으로 남았다(2024 저주파자극기 대수 90%). 그래서 15057456 API(mfds_permits)의
# 허가 업체(ENTRPS)·제조원(MANUF_NM)으로 채운다. MEDIDOCS(pipeline/medidocs/transforms/makers.py)
# 에서 검증한 규칙을 그대로 옮겼다 — 정확도 우선, 확정 못 하면 비워 둔다.
#   1) 국내 제조 허가(제허·제인·제신…)는 허가 업체 = 제조사, 수입 허가(수허·수인·수신)는 제조원.
#   2) 한 허가번호의 허가 행들이 서로 다른 회사를 가리키면 쓰지 않는다. 1990년대 번호는 지방청마다
#      따로 매겨 접두어를 떼면 겹친다(예: 제허96-1호 = 40여 개 회사).
#   3) 구성품 허가(디텍터·센서·카세트…)는 쓰지 않는다. 심평원에 장비 본체 대신 구성품 허가번호가
#      적힌 경우라 업체가 장비 브랜드가 아니다.
#   4) 그래도 비는 행은 같은 (분류, 모델명)에서 확정된 대수의 95% 이상이 한 회사일 때만 그 회사로.
# 회사 표기는 COMPANY_ALIASES 로 묶는다. 표시명은 **레거시 6분류에 이미 있는 표기를 그대로**
# 쓴다(DRGEM·Samsung Medison 등) — 기존 브랜드 이름을 바꾸지 않기 위해서다.

DOMESTIC_LICENSE = re.compile(r"^(제허|제인|제신)")   # 국내 제조 허가·인증·신고
IMPORT_LICENSE = re.compile(r"^(수허|수인|수신)")     # 수입 허가·인증·신고
# 그 밖의 번호(인22-…·신·허 단독, 체외… 등)는 앞글자로 국산·수입을 가릴 수 없다 → 제조원이 적혀 있으면 제조원,
# 없으면 허가 업체(수입품은 허가 자료에 제조원이 적힌다).
COMPONENT_PRODUCT = re.compile(r"검출기|디텍터|센서|부품|카세트")    # 구성품 허가 품목명
PROPAGATE_SHARE = 0.95

# (표시명, 업체명에 들어 있으면 그 회사로 보는 낱말들 — 소문자). 위에서부터 먼저 맞는 것.
# 확실한 같은 회사(법인·공장 표기 차이)만 묶는다. 인수·합병 관계로 추정해 합치지 않는다.
# 낱말은 앞이 글자가 아닐 때만 맞는다('alcon' 이 'Falcon' 에, '바텍' 이 '콘바텍(ConvaTec)' 에 걸리지 않게).
COMPANY_ALIASES = [
    # 레거시 6분류 표기 그대로
    # 'siemens' 단독은 안 쓴다 — SIEMENS MEDICAL INSTRUMENTS(보청기, 지금은 다른 회사)가 걸린다
    ("Siemens Healthineers", ("siemens healthineers", "siemens healthcare", "siemens medical system",
                              "siemens medical solution", "siemens ag", "siemens shenzhen",
                              "siemens shanghai", "지멘스헬시니어스", "지멘스메디칼")),
    ("Philips", ("philips", "필립스")),
    ("GE Healthcare", ("ge medical", "ge healthcare", "ge oec", "ge vingmed", "ge ultrasound",
                       "ge hualun", "ge precision", "general electric", "한국지이초음파", "지이헬스케어",
                       # GE 헬스케어 법인(마취기·환자감시). 제품은 GE 상표로 팔리고 ERP 도 GE 로 보여 왔다
                       "datex-ohmeda", "critikon")),
    ("Canon Medical", ("canon medical", "toshiba medical", "캐논메디칼")),
    ("Fujifilm", ("fujifilm", "후지필름")),
    ("Samsung Medison", ("samsung medison", "삼성메디슨")),
    ("Hologic", ("hologic",)),
    ("Shimadzu", ("shimadzu",)),
    ("Mindray", ("mindray",)),
    ("Olympus", ("olympus", "올림푸스")),
    ("Carestream", ("carestream",)),
    ("Konica Minolta", ("konica minolta",)),
    ("Medtronic", ("medtronic", "메드트로닉")),
    ("Boston Scientific", ("boston scientific",)),
    ("Esaote", ("esaote",)),
    ("Alpinion", ("alpinion", "알피니언")),
    ("Healcerion", ("healcerion", "힐세리온")),
    ("DRGEM", ("drgem", "디알젬")),
    ("LISTEM", ("listem", "리스템")),
    ("Genoray", ("genoray", "제노레이")),
    ("OsteoSys", ("osteosys", "오스테오시스")),
    ("SG Healthcare", ("sg healthcare", "에스지헬스케어")),
    ("GEMSS", ("gemss", "젬스헬스케어")),
    ("ECORAY", ("ecoray", "에코레이")),
    ("디알텍", ("drtech", "디알텍")),
    ("DK메디칼시스템", ("디케이메디칼",)),
    ("포스콤", ("poskom", "포스콤")),
    # 레거시에 없는 회사 (MEDIDOCS 회사 그룹 + 심평원 분류에서 표기가 여러 갈래인 큰 회사)
    ("Intuitive Surgical", ("intuitive surgical",)),
    ("Varian", ("varian medical",)),
    ("Elekta", ("elekta",)),
    ("Accuray", ("accuray",)),
    ("Pentax", ("pentax",)),
    ("Karl Storz", ("karl storz",)),
    ("Storz Medical", ("storz medical",)),
    ("Nidek", ("nidek",)),
    ("Lumenis", ("lumenis",)),
    ("Brainlab", ("brainlab",)),
    ("Stryker", ("stryker",)),
    ("Dräger", ("dräger", "drager", "draeger")),
    ("Sirona", ("sirona",)),
    ("Agfa", ("agfa",)),
    ("Richard Wolf", ("richard wolf",)),
    ("BTL", ("btl industries",)),
    ("Quantel Medical", ("quantel",)),
    ("Candela", ("candela",)),
    ("Dornier", ("dornier",)),
    ("Alcon", ("alcon",)),
    ("Carl Zeiss Meditec", ("carl zeiss",)),
    ("Ellex", ("ellex",)),
    ("Nihon Kohden", ("nihon kohden", "nihonkohden", "니혼코덴")),
    ("Fresenius", ("fresenius",)),
    ("Gambro", ("gambro",)),
    ("Woodpecker", ("guilin woodpecker",)),
    ("B. Braun", ("b.braun", "b. braun")),
    ("J. Morita", ("j. morita", "j.morita")),
    ("Maquet", ("maquet",)),
    ("바텍", ("vatech", "바텍")),
    ("덴티움", ("dentium", "덴티움")),
]
_ALIAS_RES = [
    (name, re.compile("|".join(
        # 앞이 글자가 아니거나, 국내 법인 이름처럼 "한국"으로 시작할 때(한국후지필름·한국필립스·한국올림푸스)
        r"(?:(?<![a-z가-힣])|(?<=한국))" + re.escape(k) for k in keys)))
    for name, keys in COMPANY_ALIASES
]
_KR_LEGAL = re.compile(r"\(주\)|㈜|주식회사|\(유\)|유한회사|\(재\)|\(사\)|\(합\)")
_EN_LEGAL = re.compile(
    r"[\s,]+(co\.?,?\s*ltd\.?|co\.|inc\.?|gmbh|corp(oration)?\.?|limited|ltd\.?|llc|s\.?\s?a\.?|"
    r"s\.?p\.?a\.?|ag|ab|a/s|oy|b\.?v\.?|pte\.?)\s*$", re.I)
_HAS_WORD = re.compile(r"[0-9A-Za-z가-힣]")
# 법인 표기 뒤에 붙는 공장·지사·DBA 표기까지 잘라 낸다: "Toray Medical Co., Ltd. Shizuoka Plant" → "Toray Medical",
# "Natus Medical Inc. DBA Excel-Tech" · "Natus Medical Incorporated DBA …" → 둘 다 "Natus Medical".
_EN_LEGAL_CUT = re.compile(
    r"[\s,]+(co\.?,?\s*ltd\b|company\s+ltd\b|co\.|inc\b\.?|incorporated\b|gmbh\b|corp\b\.?|corporation\b|limited\b|ltd\b\.?|llc\b|pte\b\.?)", re.I)
_PAREN_NOTE = re.compile(r"\((제조자|본사|제조원|(?:a\s+)?subsidiary of[^)]*)\)", re.I)  # 원본에 섞인 설명 괄호


def company_display(name):
    """업체명 → 표시용 회사명. 묶인 회사면 그 표시명, 아니면 법인 표기((주)·Co., Ltd. 등)만 뗀 원문.

    글자가 하나도 없는 값('(' 같은 원본 오류)은 None.
    """
    if not name:
        return None
    low = name.lower()
    for display, rx in _ALIAS_RES:
        if rx.search(low):
            return display
    n = _PAREN_NOTE.sub(" ", _KR_LEGAL.sub("", name))
    cut = _EN_LEGAL_CUT.search(n)
    if cut and _HAS_WORD.search(n[:cut.start()]):
        n = n[:cut.start()]
        if n.count("(") > n.count(")"):   # 괄호 안에서 잘렸으면 그 괄호부터 버린다
            n = n[:n.rfind("(")]
    prev = None
    while prev != n:
        prev = n
        n = _EN_LEGAL.sub("", n.strip(" ,.")).strip(" ,.")
    n = re.sub(r"\s+", " ", n).strip(" ,.-·")
    return n if _HAS_WORD.search(n) else None


def license_names(license_no, permits):
    """허가 행들이 가리키는 회사 표시명 집합. 국내 제조 허가는 허가 업체, 수입 허가는 제조원.

    permits: [(entrps, manuf_nm, product, permit_date, changed_date), ...]
    빈 집합 = 허가 자료에 회사가 없다(예: 제조원 칸이 빈 수입 허가). 둘 이상 = 번호가 겹친다.
    """
    if not license_no:
        return set()
    if DOMESTIC_LICENSE.match(license_no):
        pick = lambda p: p[0]  # noqa: E731
    elif IMPORT_LICENSE.match(license_no):
        pick = lambda p: p[1]  # noqa: E731
    else:
        pick = lambda p: p[1] or p[0]  # noqa: E731
    return {company_display(pick(p)) for p in permits} - {None}


def license_company(license_no, permits):
    """허가번호 하나의 허가 행들 → (표시 회사명, 구성품 허가인가) 또는 None.

    회사가 정확히 하나일 때만 값이 있다(license_names 참고). 구성품 여부는 가장 최근 허가 행의
    품목명으로 본다.
    """
    names = license_names(license_no, permits)
    if len(names) != 1:
        return None
    last = max(permits, key=lambda p: (p[3] or "", p[4] or ""))
    return names.pop(), bool(COMPONENT_PRODUCT.search(last[2] or ""))


def model_key(category, model):
    """모델 전파 키. 브랜드 표(_key)와 같은 접기 — 대소문자·공백·기호 차이만 흡수한다."""
    return _key(category, model)


def propagate(votes, share=PROPAGATE_SHARE):
    """{(분류, 모델 키): Counter{회사: 대수}} → {(분류, 모델 키): 회사}.

    확정된 대수 중 한 회사가 share 이상일 때만. 모델 키가 빈 그룹은 쓰지 않는다.
    """
    out = {}
    for k, cnt in votes.items():
        if not k[1] or not cnt:
            continue
        top, n = cnt.most_common(1)[0]
        if n / sum(cnt.values()) >= share:
            out[k] = top
    return out
