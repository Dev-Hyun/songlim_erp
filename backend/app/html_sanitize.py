"""리치텍스트 게시판(공지사항/CS/커뮤니티)에 저장되는 HTML을 화이트리스트 기반으로 정리한다.
프론트 에디터(TipTap)가 만드는 태그만 신뢰하고, API를 직접 두드려 넣은 악성 HTML(script 등)은 걸러낸다."""
from bs4 import BeautifulSoup

ALLOWED_TAGS = {
    "p", "br", "span", "strong", "b", "em", "i", "u", "s", "h1", "h2", "h3",
    "ul", "ol", "li", "blockquote", "a", "img", "code", "pre", "hr",
}
ALLOWED_ATTRS = {
    "a": {"href", "target", "rel"},
    "img": {"src", "alt"},
}

# 인라인 style로 허용할 CSS 속성만 남긴다(글자색·정렬·배경색). TipTap의 색상/정렬 기능이 이 값들을 쓴다.
ALLOWED_STYLE_PROPS = {"color", "text-align", "background-color"}
# style을 달 수 있는 태그(그 외 태그의 style은 제거)
STYLE_TAGS = {"p", "h1", "h2", "h3", "span", "li", "blockquote"}


def _clean_style(value: str) -> str:
    """style 속성값에서 화이트리스트 CSS 속성만, 안전한 값만 남긴다."""
    kept = []
    for decl in value.split(";"):
        if ":" not in decl:
            continue
        prop, val = decl.split(":", 1)
        prop = prop.strip().lower()
        val = val.strip()
        if prop not in ALLOWED_STYLE_PROPS or not val:
            continue
        low = val.lower()
        # url()/expression()/javascript: 등 위험한 값은 통째로 버린다
        if any(bad in low for bad in ("url(", "expression", "javascript:", "</", "<")):
            continue
        kept.append(f"{prop}: {val}")
    return "; ".join(kept)


def sanitize_html(html: str | None) -> str:
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all(True):
        if tag.name in ("script", "style", "iframe", "object", "embed"):
            tag.decompose()
            continue
        if tag.name not in ALLOWED_TAGS:
            tag.unwrap()
            continue
        allowed = ALLOWED_ATTRS.get(tag.name, set())
        for attr in list(tag.attrs):
            if attr == "style" and tag.name in STYLE_TAGS:
                cleaned = _clean_style(tag.get("style", ""))
                if cleaned:
                    tag["style"] = cleaned
                else:
                    del tag["style"]
                continue
            if attr not in allowed:
                del tag[attr]
        if tag.name == "a":
            if tag.get("href", "").strip().lower().startswith("javascript:"):
                del tag["href"]
            tag["rel"] = "noopener noreferrer"
            tag["target"] = "_blank"
        if tag.name == "img" and tag.get("src", "").strip().lower().startswith("javascript:"):
            del tag["src"]
    return str(soup)
