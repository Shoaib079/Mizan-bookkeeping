"""Bundled Unicode PDF fonts — DejaVu Sans (Phase 8.5 Slice 5)."""

from __future__ import annotations

from importlib.resources import as_file, files

PDF_FONT_NAME = "MizanDejaVuSans"
PDF_FONT_BOLD_NAME = "MizanDejaVuSans-Bold"
_REQUIRED_GLYPHS = "₺ğışİĞIŞ"
_FONTS_REGISTERED = False


class PdfFontError(RuntimeError):
    """Bundled font missing or cannot render required glyphs."""


def register_bundled_fonts() -> None:
    """Register DejaVu Sans regular + bold from the application package."""
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return

    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    regular_res = files("app").joinpath("assets", "fonts", "DejaVuSans.ttf")
    bold_res = files("app").joinpath("assets", "fonts", "DejaVuSans-Bold.ttf")
    if not regular_res.is_file() or not bold_res.is_file():
        raise PdfFontError("bundled font files missing under app/assets/fonts/")

    with as_file(regular_res) as regular, as_file(bold_res) as bold:
        pdfmetrics.registerFont(TTFont(PDF_FONT_NAME, str(regular)))
        pdfmetrics.registerFont(TTFont(PDF_FONT_BOLD_NAME, str(bold)))
        _assert_glyphs_supported(PDF_FONT_NAME, _REQUIRED_GLYPHS)
        _assert_glyphs_supported(PDF_FONT_BOLD_NAME, _REQUIRED_GLYPHS)
    _FONTS_REGISTERED = True


def _assert_glyphs_supported(font_name: str, text: str) -> None:
    from reportlab.pdfbase.pdfmetrics import getFont

    face = getFont(font_name).face
    missing: list[str] = []
    for char in text:
        code = ord(char)
        width = face.charWidths.get(code)
        if width is None or width <= 0:
            missing.append(char)
    if missing:
        raise PdfFontError(
            f"font {font_name!r} cannot render required glyph(s): {''.join(missing)!r}"
        )


def assert_text_renderable(text: str) -> None:
    """Fail loudly if bundled regular font cannot render every character."""
    register_bundled_fonts()
    _assert_glyphs_supported(PDF_FONT_NAME, text)
