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


def brand_expr():
    """조회에서 '표시할 제조사'로 쓸 SQL 식.

    6분류는 brand 우선(없으면 manufacturer), 나머지는 manufacturer 그대로.
    규칙을 화면마다 되풀이하면 한쪽만 고치는 사고가 나므로 여기 한 곳에 둔다.
    """
    from sqlalchemy import case, func

    from app.models.sales_map import Equipment

    return case(
        (Equipment.category.in_(BRAND_CATEGORIES),
         func.coalesce(Equipment.brand, Equipment.manufacturer)),
        else_=Equipment.manufacturer,
    )
