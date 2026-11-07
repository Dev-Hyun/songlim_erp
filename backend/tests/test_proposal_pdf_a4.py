"""제안서 PDF 용지 = 정확한 A4 가로(297×210mm)."""
import pymupdf

from app.proposal.pdf import _fit_a4


def test_fit_a4_makes_exact_a4_landscape_and_keeps_pages_text_title():
    # 크롬이 내보내는 크기(842.88×595.92pt = 297.35×210.23mm)로 2장짜리 PDF
    src = pymupdf.open()
    for n in (1, 2):
        src.new_page(width=842.88, height=595.92).insert_text((72, 72), f"page {n}")
    src.set_metadata({"title": "2026-11-08_proposal"})

    out = pymupdf.open(stream=_fit_a4(src.tobytes()), filetype="pdf")

    assert out.page_count == 2
    for pg in out:
        assert round(pg.rect.width / 72 * 25.4, 2) == 297.00
        assert round(pg.rect.height / 72 * 25.4, 2) == 210.00
    assert "page 2" in out[1].get_text()
    assert out.metadata["title"] == "2026-11-08_proposal"
