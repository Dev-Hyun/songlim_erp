"""리치텍스트 게시판(공지사항/CS/커뮤니티)에 저장되는 HTML을 화이트리스트 기반으로 정리한다.
프론트 에디터(TipTap)가 만드는 태그만 신뢰하고, API를 직접 두드려 넣은 악성 HTML(script 등)은 걸러낸다."""
from bs4 import BeautifulSoup

ALLOWED_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "s", "h1", "h2", "h3",
    "ul", "ol", "li", "blockquote", "a", "img", "code", "pre",
}
ALLOWED_ATTRS = {
    "a": {"href", "target", "rel"},
    "img": {"src", "alt"},
}


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
