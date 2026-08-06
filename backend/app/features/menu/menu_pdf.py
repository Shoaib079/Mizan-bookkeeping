"""The menu PDF — the document that goes to agencies (MENU_PLAN.md slice 4).

Deliberately *not* built on `reports/pdf_export.py`. That module's page
furniture is branded for Mizan — a blue masthead and a "Mizan · Page 2"
footer — because those documents are the bookkeeping app reporting to its
owner. This one is the restaurant speaking to its customers, and Mizan's name
has no business on it.

What is shared is the font. `app/core/pdf/fonts.py` bundles DejaVu Sans so
`ğışİĞIŞ` and `₺` render on a server with no system fonts installed, which is
every server this runs on. Turkish dish descriptions were the whole reason it
was bundled.

reportlab is imported inside functions, never at module scope, so a missing
dependency cannot break API startup or pytest collection.
"""

from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace

from app.core.pdf.fonts import (
    PDF_FONT_BOLD_NAME,
    PDF_FONT_NAME,
    register_bundled_fonts,
)
from app.features.menu.document import MenuBlock, MenuDocument

# Print, not screen. Near-black rather than pure black, which reads as heavy on
# paper, and a grey light enough to recede without disappearing on a photocopy.
_INK = "#1A1A1A"
_MUTED = "#6B6B6B"
_HAIRLINE = "#D8D8D8"

#: The logo box on the first page. Bounds, not a size — the image is scaled to
#: fit inside while keeping its proportions, so a wide logo and a tall one both
#: sit correctly and neither is squashed.
_LOGO_MAX_W_CM = 6.0
_LOGO_MAX_H_CM = 3.6


class MenuPdfError(RuntimeError):
    """The menu could not be rendered."""


def _rl() -> SimpleNamespace:
    """reportlab's pieces, by name.

    A namespace rather than a tuple: the financial exporter unpacks an
    eleven-element tuple positionally in six places, and adding a flowable
    there means editing every one of them correctly.
    """
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.lib.utils import ImageReader
        from reportlab.platypus import (
            BaseDocTemplate,
            Frame,
            HRFlowable,
            Image,
            KeepTogether,
            PageBreak,
            PageTemplate,
            Paragraph,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError as exc:  # pragma: no cover - dependency is declared
        raise MenuPdfError(
            "reportlab is required to build the menu PDF; install project dependencies"
        ) from exc
    return SimpleNamespace(
        colors=colors,
        A4=A4,
        ParagraphStyle=ParagraphStyle,
        cm=cm,
        ImageReader=ImageReader,
        BaseDocTemplate=BaseDocTemplate,
        Frame=Frame,
        HRFlowable=HRFlowable,
        Image=Image,
        KeepTogether=KeepTogether,
        PageBreak=PageBreak,
        PageTemplate=PageTemplate,
        Paragraph=Paragraph,
        Spacer=Spacer,
        Table=Table,
        TableStyle=TableStyle,
    )


def _styles() -> dict:
    style = _rl().ParagraphStyle

    def make(name: str, **kwargs):
        kwargs.setdefault("fontName", PDF_FONT_NAME)
        kwargs.setdefault("textColor", _INK)
        return style(name, **kwargs)

    return {
        "restaurant": make(
            "restaurant",
            fontName=PDF_FONT_BOLD_NAME,
            fontSize=20,
            leading=24,
            alignment=1,
        ),
        "category": make(
            "category",
            fontName=PDF_FONT_BOLD_NAME,
            fontSize=12,
            leading=15,
            spaceBefore=14,
            spaceAfter=4,
        ),
        "menuName": make(
            "menuName", fontName=PDF_FONT_BOLD_NAME, fontSize=11.5, leading=14
        ),
        "menuPrice": make(
            "menuPrice",
            fontName=PDF_FONT_BOLD_NAME,
            fontSize=11.5,
            leading=14,
            alignment=2,
        ),
        "menuDesc": make("menuDesc", fontSize=9, leading=12, textColor=_MUTED),
        "dish": make("dish", fontSize=10, leading=13.5),
        "dishDesc": make(
            "dishDesc", fontSize=8.5, leading=11, leftIndent=10, textColor=_MUTED
        ),
        "terms": make("terms", fontSize=9, leading=13),
        "contact": make("contact", fontSize=9.5, leading=13, alignment=1),
        "validity": make(
            "validity", fontSize=9, leading=12, alignment=1, textColor=_MUTED
        ),
    }


def _escape(text: str) -> str:
    """reportlab's Paragraph parses a tiny HTML dialect.

    A dish called "Fish & Chips" or a term reading "<10 guests" would otherwise
    raise a parse error at generation time, or worse, silently swallow the rest
    of the line.
    """
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _logo_flowable(logo: bytes | None):
    """The logo, scaled to fit its box, or None if it cannot be drawn.

    A logo that reportlab rejects must not take the prices down with it. The
    upload already checks the format; this catches the rest — a truncated file,
    an unsupported colour profile — and prints the menu without it.
    """
    if not logo:
        return None
    rl = _rl()
    try:
        width, height = rl.ImageReader(BytesIO(logo)).getSize()
    except Exception:  # noqa: BLE001 - any decode failure means "print without"
        return None
    if not width or not height:
        return None

    scale = min(_LOGO_MAX_W_CM * rl.cm / width, _LOGO_MAX_H_CM * rl.cm / height)
    try:
        image = rl.Image(BytesIO(logo), width=width * scale, height=height * scale)
    except Exception:  # noqa: BLE001
        return None
    image.hAlign = "CENTER"
    return image


def _menu_parts(menu: MenuBlock, styles: dict, content_width: float) -> list:
    """One menu: its name and price, then its dishes."""
    rl = _rl()
    price = menu.price_line()

    if price:
        # Name hard left, price hard right, across the full column. Run inline
        # after the name instead and the whole document crowds into the left
        # half of the page while the reader hunts for the figure.
        #
        # A table rather than a tab stop because the name cell is a Paragraph:
        # a menu called "Vegetarian Set Menu for Groups of Twenty or More"
        # wraps within its column instead of colliding with the price.
        price_width = 5.0 * rl.cm
        heading = rl.Table(
            [[
                rl.Paragraph(_escape(menu.name), styles["menuName"]),
                rl.Paragraph(_escape(price), styles["menuPrice"]),
            ]],
            colWidths=[content_width - price_width, price_width],
            style=rl.TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]),
        )
    else:
        heading = rl.Paragraph(_escape(menu.name), styles["menuName"])

    parts: list = [heading]
    if menu.description:
        parts.append(rl.Paragraph(_escape(menu.description), styles["menuDesc"]))
    parts.append(rl.Spacer(1, 3))

    for dish in menu.dishes:
        parts.append(rl.Paragraph(f"• {_escape(dish.heading())}", styles["dish"]))
        # English then Turkish, each on its own line. Both print when both
        # exist: the agencies these go to read one or the other.
        for text in (dish.description, dish.description_tr):
            if text:
                parts.append(rl.Paragraph(_escape(text), styles["dishDesc"]))

    parts.append(rl.Spacer(1, 10))
    return parts


def _group_elements(group, styles: dict, content_width: float) -> list:
    """A category heading and the menus under it.

    Two uses of `KeepTogether`, each fixing something seen on a real render:

    - The heading travels with its first menu. Without it, "Catering" printed
      alone at the foot of page one and its menu began page two.
    - Each menu holds together, so a price never lands on one page with its
      dishes on the next — which is how a reader quotes the wrong figure.
    """
    rl = _rl()
    if not group.menus:
        return []
    heading = rl.Paragraph(_escape(group.label), styles["category"])
    first = _menu_parts(group.menus[0], styles, content_width)
    elements: list = [rl.KeepTogether([heading, *first])]
    elements.extend(
        rl.KeepTogether(_menu_parts(menu, styles, content_width))
        for menu in group.menus[1:]
    )
    return elements


def _closing_elements(document: MenuDocument, styles: dict) -> list:
    """Terms, validity and the address — the last page.

    On its own page rather than trailing the final menu, because it is the page
    an agency comes back to, and hunting for it under the catering prices is
    not what you want them doing.
    """
    rl = _rl()
    restaurant = document.restaurant
    terms = restaurant.terms_lines()
    contacts = restaurant.contact_lines()
    if not terms and not contacts and not restaurant.validity_note:
        return []

    parts: list = [rl.PageBreak()]

    if terms:
        parts.append(rl.Paragraph("Terms and conditions", styles["category"]))
        parts.extend(
            rl.Paragraph(f"• {_escape(line)}", styles["terms"]) for line in terms
        )
        parts.append(rl.Spacer(1, 16))

    logo = _logo_flowable(restaurant.logo)
    if logo is not None:
        parts.extend([rl.Spacer(1, 8), logo, rl.Spacer(1, 8)])

    if contacts or restaurant.validity_note:
        parts.append(
            rl.HRFlowable(
                width="60%",
                thickness=0.5,
                color=rl.colors.HexColor(_HAIRLINE),
                spaceBefore=6,
                spaceAfter=10,
                hAlign="CENTER",
            )
        )
    # The name always prints here even when the logo carries it, because this
    # is the block someone copies into an email.
    parts.append(rl.Paragraph(_escape(restaurant.name), styles["contact"]))
    parts.extend(rl.Paragraph(_escape(line), styles["contact"]) for line in contacts)
    if restaurant.validity_note:
        parts.append(rl.Spacer(1, 8))
        parts.append(
            rl.Paragraph(_escape(restaurant.validity_note), styles["validity"])
        )
    return parts


def build_menu_pdf(document: MenuDocument) -> bytes:
    rl = _rl()
    register_bundled_fonts()
    styles = _styles()
    restaurant = document.restaurant

    margin = 1.8 * rl.cm
    bottom_margin = margin * 1.2
    content_width = rl.A4[0] - 2 * margin

    elements: list = []

    logo = _logo_flowable(restaurant.logo)
    if logo is not None:
        elements.extend([logo, rl.Spacer(1, 10)])
    else:
        # Printed only when there is no logo. Most restaurant logos already
        # contain the name, and setting it again underneath is how a document
        # ends up saying "India Gate" twice in two typefaces.
        elements.append(rl.Paragraph(_escape(restaurant.name), styles["restaurant"]))
        elements.append(rl.Spacer(1, 10))

    elements.append(
        rl.HRFlowable(
            width="100%",
            thickness=0.5,
            color=rl.colors.HexColor(_HAIRLINE),
            spaceAfter=6,
        )
    )

    for group in document.groups:
        elements.extend(_group_elements(group, styles, content_width))

    elements.extend(_closing_elements(document, styles))

    buffer = BytesIO()
    footer_text = restaurant.name

    def _draw_footer(canvas, _doc) -> None:
        """The restaurant's name and a page number — and nothing of Mizan's.

        The financial exports sign themselves "Mizan · Page 2" because the
        reader is the owner. Here the reader is a tour agency, and a
        bookkeeping app's name on a price list only raises questions.
        """
        canvas.saveState()
        width, _height = rl.A4
        y = margin * 0.55
        canvas.setFont(PDF_FONT_NAME, 7.5)
        canvas.setFillColor(rl.colors.HexColor(_MUTED))
        canvas.drawString(margin, y, footer_text)
        canvas.drawRightString(width - margin, y, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()

    doc = rl.BaseDocTemplate(
        buffer,
        pagesize=rl.A4,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=bottom_margin,
        title=f"{restaurant.name} — Menu",
        author=restaurant.name,
    )
    # An explicit frame with no padding, rather than SimpleDocTemplate's.
    # Its frame pads 6pt on every side, so paragraphs sat 6pt inside the
    # margin while a full-width table — which overflowed and was centred —
    # sat 6pt outside it. Headings and prices ended up misaligned by 12pt
    # against each other and against the footer, which draws at the margin.
    doc.addPageTemplates([
        rl.PageTemplate(
            id="menu",
            frames=[
                rl.Frame(
                    margin,
                    bottom_margin,
                    content_width,
                    rl.A4[1] - margin - bottom_margin,
                    leftPadding=0,
                    rightPadding=0,
                    topPadding=0,
                    bottomPadding=0,
                    id="body",
                )
            ],
            onPage=_draw_footer,
        )
    ])
    doc.build(elements)
    return buffer.getvalue()


def menu_pdf_filename(entity_name: str) -> str:
    from datetime import date

    from app.features.reports.excel_export import export_filename

    return export_filename(
        "menu", entity_name=entity_name, as_of=date.today(), extension=".pdf"
    )
