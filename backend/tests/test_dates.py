"""Date presentation shared by every export (app/core/dates.py)."""

from __future__ import annotations

from datetime import date, datetime

from app.core.dates import format_as_of, format_date, format_period


def test_dates_read_the_turkish_way() -> None:
    assert format_date(date(2026, 7, 1)) == "01.07.2026"
    assert format_date(datetime(2026, 7, 1, 15, 30)) == "01.07.2026"


def test_iso_strings_are_accepted() -> None:
    """Report schemas hand over dates as strings in places."""
    assert format_date("2026-07-01") == "01.07.2026"


def test_unrecognised_input_passes_through_untouched() -> None:
    """Better a label rendered as-is than an export that raises."""
    assert format_date("Opening") == "Opening"
    assert format_date("") == ""


def test_a_period_names_both_ends() -> None:
    assert format_period(date(2026, 6, 1), date(2026, 6, 30)) == (
        "01.06.2026 – 30.06.2026"
    )


def test_point_in_time_reports_say_as_of() -> None:
    assert format_as_of(date(2026, 6, 30)) == "as of 30.06.2026"


def test_every_report_module_formats_through_this_one() -> None:
    """The PDF and Excel halves of a download drifted apart once — the workbook
    interpolated raw dates while the PDF formatted them, so one month pack
    described its period two different ways. Nothing user-facing may build a
    period string by hand again."""
    from pathlib import Path

    reports = Path(__file__).resolve().parents[1] / "app" / "features" / "reports"
    offenders = [
        path.name
        for path in reports.glob("*.py")
        if "} to {" in path.read_text()
    ]
    assert offenders == [], f"hand-built period strings in: {offenders}"
