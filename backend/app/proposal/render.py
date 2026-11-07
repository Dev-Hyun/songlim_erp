"""제안서 HTML 렌더링 — 미리보기와 PDF가 같은 HTML을 쓴다.

asset_base: 주요 장비 사진·치료장비 기본 사진의 기준 URL
  - 미리보기: "{API}/api/proposals/static/"
  - PDF:      "file:///…/app/proposal/static/" (Chromium이 디스크에서 바로 읽음)
upload_base: 업로드한 치료장비 사진 기준 URL ("…/api/proposals/therapy-image/" 또는 file:///…/uploads/proposal_therapy/)
"""
import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup, escape

TEMPLATES = Path(__file__).parent / "templates"
STATIC_DIR = Path(__file__).parent / "static"

INTRO_LEAD = ("당사는 지난 20여 년 동안 병·의원의 방사선 관련 장비(DR, X-ray, Mammo, 초음파 등)와 "
              "기타 의료장비·소모품을 공급해 온, 서비스가 철저한 의료기기 전문 기업입니다.")
INTRO_PTS = [
    ("임상 경험", "임상 경험이 있는 의료기사들을 중심으로 설립되어 병원에 필요한 다양한 노하우가 축적된 기업"),
    ("전국 A/S 네트워크", "대전 본사, 서울 지사, 대구 지사를 중심으로 **전국적인 A/S Network**가 구축되어 있는 기업"),
    ("방사선사 출신 엔지니어", "방사선사 출신 엔지니어로 구성된 기술팀이 철저한 A/S를 원칙으로 생각하는 기업"),
    ("정직 · 근면 · 성실", "정직, 근면, 성실이라는 사훈 아래 고객과의 신뢰를 가장 우선으로 생각하는 기업"),
]
WHY = [
    ("SERVICE", "빠르고 꾸준한 관리", ["서울·대전·대구 지사 Network를 통한 **신속한 Service** 지원",
                                    "원격 지원 대응으로 고객의 불편 최소화", "주기적 정기점검을 통한 사전 예방 Service"]),
    ("PRICE", "거품 없는 정직한 가격", ["고무줄 가격이 아닌 **정직한 가격**으로 제안드립니다.",
                                      "협력 업체들 간의 긴밀한 공조로 불필요한 거품을 제거했습니다."]),
    ("PROMOTION", "개원 이후까지 함께", ["병원의 **On-line Marketing 협력·지원** Promotion",
                                     "Medical ERP, 뉴로게이트 등 병원에 필요한 다양한 Solution 제안"]),
]

_BOLD = re.compile(r"\*\*(.+?)\*\*")


def _mark(text, tag_open: str, tag_close: str) -> Markup:
    """이스케이프 후 **x** → 태그, 줄바꿈 → <br>. 사용자가 넣은 HTML은 그대로 글자로 보인다."""
    s = str(escape(text or ""))
    s = _BOLD.sub(lambda m: f"{tag_open}{m.group(1)}{tag_close}", s)
    return Markup(s.replace("\n", "<br>"))


def hl(text) -> Markup:
    return _mark(text, '<b class="hl">', "</b>")


def em(text) -> Markup:
    return _mark(text, "<em>", "</em>")


def num(n) -> str:
    return f"{int(n):,}"


def won(n) -> str:
    return f"{int(n):,}원"


def krw(n) -> str:
    return f"₩{int(n):,}"


_env = Environment(loader=FileSystemLoader(str(TEMPLATES)), autoescape=select_autoescape(["html"]),
                   trim_blocks=True, lstrip_blocks=True)
_env.filters.update(hl=hl, em=em, num=num, won=won, krw=krw)


def _long_date(d: str) -> str:
    y, m, day = d.split("-")
    return f"{y}년 {m}월 {day}일"


def _toc(pages: list[dict]) -> list[tuple[str, str]]:
    """A 표지 오른쪽 '제안 품목' 목록: 카테고리별 첫 모델 + 외 N."""
    out: dict[str, list[str]] = {}
    for p in pages:
        if p["kind"] == "eq":
            out.setdefault(p["cat"], []).append(p["model"])
        elif p["kind"] == "us":
            out.setdefault(p["cat"], []).append(p["brand"])
        elif p["kind"] == "rx":
            out.setdefault(p["cat"], []).extend(r["model"] or r["name"] for r in p["rows"])
        elif p["kind"] in ("pacs", "hck", "x3c", "seld"):
            out.setdefault(p["cat"], [])
    toc = []
    for cat, names in out.items():
        if cat == "치료장비":
            toc.append((cat, f"{len(names)}개 품목"))
        elif names:
            toc.append((cat, names[0] if len(names) == 1 else f"{names[0]} 외 {len(names) - 1}"))
    return toc[:7]


def render_html(proposal: dict, pages: list[dict], *, asset_base: str, upload_base: str, for_pdf: bool = False) -> str:
    def asset(path: str) -> str:
        return asset_base + path

    def therapy_src(key: str | None) -> str:
        if not key:
            return ""
        if key.startswith("seed/"):
            return asset_base + "therapy/" + key[5:]
        if key.startswith("up/"):
            return upload_base + key[3:]
        return ""

    p = dict(proposal)
    p["date_long"] = _long_date(p["proposal_date"])
    p["date_short"] = p["proposal_date"].replace("-", ".")
    design = p.get("design") or "A"
    return _env.get_template("proposal.html").render(
        p=p, pages=pages, total=len(pages), design=design, toc=_toc(pages),
        intro_lead=INTRO_LEAD, intro_pts=INTRO_PTS, why_rows=WHY,
        asset=asset, therapy_src=therapy_src, for_pdf=for_pdf,
    )
