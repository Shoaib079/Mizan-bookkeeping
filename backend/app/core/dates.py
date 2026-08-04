"""Date presentation for anything an owner reads (Decisions §5 sibling to money).

Reports are read in Turkey, so dates render 01.07.2026 — the same convention
already used in Excel cells, period-lock messages and the month pack PDF. The
labels around them stay English; this is number formatting, not language.

Kept out of the PDF and Excel modules on purpose: when only the PDF half knew
how to format a period, a downloaded month pack showed `01.06.2026 – 30.06.2026`
on the PDF and `2026-06-01 to 2026-06-30` in the workbook — two halves of one
download disagreeing.

Filenames are deliberately NOT formatted with these: they keep ISO so a folder
of exports sorts chronologically.
"""

from __future__ import annotations

from datetime import date, datetime

DISPLAY_FORMAT = "%d.%m.%Y"


def format_date(value: object) -> str:
    """Render a date (or an ISO string) as 01.07.2026, unrecognised input as-is."""
    if isinstance(value, (date, datetime)):
        return value.strftime(DISPLAY_FORMAT)
    text = str(value)
    try:
        return datetime.strptime(text, "%Y-%m-%d").strftime(DISPLAY_FORMAT)
    except ValueError:
        return text


def format_period(from_date: object, to_date: object) -> str:
    """A reporting period: 01.06.2026 – 30.06.2026."""
    return f"{format_date(from_date)} – {format_date(to_date)}"


def format_as_of(value: object) -> str:
    """Point-in-time reports (balance sheet, stock): as of 30.06.2026."""
    return f"as of {format_date(value)}"
