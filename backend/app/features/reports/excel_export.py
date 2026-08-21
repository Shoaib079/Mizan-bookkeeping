"""Excel builders for Phase 7 read-only reports."""

from __future__ import annotations

import calendar
import uuid
from datetime import date

from fastapi.responses import StreamingResponse
from io import BytesIO

from app.core.dates import format_date, format_period
from app.core.excel.labels import format_journal_source
from app.core.excel.workbook import (
    bold_row,
    create_workbook,
    finish_data_table,
    fit_columns_from_content,
    money_header,
    write_header_row,
    write_money,
    write_sheet_title,
    save_workbook_to_bytes,
)
from app.features.reports.schema import (
    BalanceSheetRead,
    CashFlowRead,
    DeliverySalesReportRead,
    KdvInputReportRead,
    PeriodComparisonRead,
    ProfitAndLossRead,
)

XLSX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


def xlsx_response(data: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        BytesIO(data),
        media_type=XLSX_CONTENT_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _write_metadata(
    ws,
    *,
    title: str,
    entity_id: uuid.UUID,
    date_label: str,
    date_value: str,
    end_col: int = 4,
    entity_label: str | None = None,
    figures_label: str | None = None,
) -> int:
    """Title block; returns the header row index (caller writes headers there)."""
    subtitles = [
        f"Entity: {entity_label if entity_label is not None else entity_id}",
        f"{date_label}: {date_value}",
    ]
    if figures_label:
        subtitles.append(figures_label)
    next_row = write_sheet_title(
        ws,
        title,
        subtitles=subtitles,
        end_col=end_col,
    )
    return next_row


def write_profit_and_loss_sheet(
    ws, report: ProfitAndLossRead, *, entity_label: str | None = None,
    figures_label: str | None = None,
) -> None:
    label = entity_label if entity_label is not None else str(report.entity_id)
    header_row = _write_metadata(
        ws,
        title="Profit and Loss",
        entity_id=report.entity_id,
        date_label="Period",
        date_value=format_period(report.from_date, report.to_date),
        end_col=4,
        entity_label=label,
        figures_label=figures_label,
    )
    amount_label = money_header()
    data_start = write_header_row(
        ws, header_row, ["Code", "Name", "Type", amount_label]
    )

    row = data_start
    for account in report.accounts:
        ws.cell(row=row, column=1, value=account.code)
        ws.cell(row=row, column=2, value=account.name_en)
        ws.cell(row=row, column=3, value=account.account_type.value)
        write_money(ws, row, 4, account.amount_kurus)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="TOTAL REVENUE")
    write_money(ws, row, 4, report.total_revenue_kurus)
    row += 1
    ws.cell(row=row, column=1, value="TOTAL EXPENSES")
    write_money(ws, row, 4, report.total_expenses_kurus)
    row += 1
    ws.cell(row=row, column=1, value="NET INCOME")
    write_money(ws, row, 4, report.net_income_kurus)
    bold_row(ws, row - 2, end_col=4)
    bold_row(ws, row - 1, end_col=4)
    bold_row(ws, row, end_col=4)

    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=row,
        end_col=4,
        money_cols=(4,),
    )
    fit_columns_from_content(
        ws,
        first_row=header_row,
        last_row=row,
        last_col=4,
        min_widths={1: 10, 2: 28, 3: 14, 4: 16},
        max_widths={1: 12, 2: 52, 3: 18, 4: 18},
        wrap_cols=(2,),
    )


def build_profit_and_loss_xlsx(report: ProfitAndLossRead, *, figures_label: str | None = None) -> bytes:
    wb, ws = create_workbook("Profit and Loss")
    write_profit_and_loss_sheet(ws, report, figures_label=figures_label)
    return save_workbook_to_bytes(wb)


def _write_balance_sheet_section(
    ws, row, section_name, accounts, subtotal_kurus, *,
    extra_label=None, extra_kurus=None, column_header_row=None,
) -> tuple[int, int | None]:
    ws.cell(row=row, column=1, value=section_name)
    bold_row(ws, row, end_col=4)
    row += 1
    header_at = row
    row = write_header_row(ws, row, ["Code", "Name", "Type", money_header("Balance")])
    if column_header_row is None:
        column_header_row = header_at
    for account in accounts:
        ws.cell(row=row, column=1, value=account.code)
        ws.cell(row=row, column=2, value=account.name_en)
        ws.cell(row=row, column=3, value=account.account_type.value)
        write_money(ws, row, 4, account.balance_kurus)
        row += 1
    if extra_label is not None and extra_kurus is not None:
        ws.cell(row=row, column=1, value=extra_label)
        write_money(ws, row, 4, extra_kurus)
        row += 1
    ws.cell(row=row, column=1, value=f"{section_name} subtotal")
    write_money(ws, row, 4, subtotal_kurus)
    bold_row(ws, row, end_col=4)
    return row + 2, column_header_row


def build_balance_sheet_xlsx(report: BalanceSheetRead, *, figures_label: str | None = None) -> bytes:
    wb, ws = create_workbook("Balance Sheet")
    row = _write_metadata(
        ws, title="Balance Sheet", entity_id=report.entity_id,
        date_label="As of", date_value=format_date(report.as_of),
        end_col=4, figures_label=figures_label,
    )
    hdr = None
    row, hdr = _write_balance_sheet_section(
        ws, row, "Assets", report.assets.accounts, report.assets.subtotal_kurus,
        column_header_row=hdr,
    )
    row, hdr = _write_balance_sheet_section(
        ws, row, "Liabilities", report.liabilities.accounts,
        report.liabilities.subtotal_kurus, column_header_row=hdr,
    )
    row, hdr = _write_balance_sheet_section(
        ws, row, "Equity", report.equity.accounts, report.equity.subtotal_kurus,
        extra_label="Unclosed net income",
        extra_kurus=report.equity.unclosed_net_income_kurus,
        column_header_row=hdr,
    )
    ws.cell(row=row, column=1, value="Total assets")
    write_money(ws, row, 4, report.total_assets_kurus)
    row += 1
    ws.cell(row=row, column=1, value="Total liabilities and equity")
    write_money(ws, row, 4, report.total_liabilities_and_equity_kurus)
    row += 1
    ws.cell(row=row, column=1, value="Accounting equation balanced")
    ws.cell(row=row, column=2, value=report.accounting_equation_balanced)
    bold_row(ws, row - 2, end_col=4)
    bold_row(ws, row - 1, end_col=4)
    assert hdr is not None
    finish_data_table(
        ws, header_row=hdr, last_data_row=row, end_col=4, money_cols=(4,),
    )
    return save_workbook_to_bytes(wb)


def build_cash_flow_xlsx(report: CashFlowRead) -> bytes:
    wb, ws = create_workbook("Cash Flow")
    header_row = _write_metadata(
        ws,
        title="Cash Flow Statement",
        entity_id=report.entity_id,
        date_label="Period",
        date_value=format_period(report.from_date, report.to_date),
        end_col=3,
    )

    data_start = write_header_row(ws, header_row, ["Metric", money_header()])
    row = data_start

    summary_rows = [
        ("Opening cash", report.opening_cash_kurus),
        ("Closing cash", report.closing_cash_kurus),
        ("Net change", report.net_change_kurus),
        ("Operating — inflows", report.operating.inflows_kurus),
        ("Operating — outflows", report.operating.outflows_kurus),
        ("Operating — net", report.operating.net_kurus),
        ("Investing — inflows", report.investing.inflows_kurus),
        ("Investing — outflows", report.investing.outflows_kurus),
        ("Investing — net", report.investing.net_kurus),
        ("Financing — inflows", report.financing.inflows_kurus),
        ("Financing — outflows", report.financing.outflows_kurus),
        ("Financing — net", report.financing.net_kurus),
    ]
    for label, value in summary_rows:
        ws.cell(row=row, column=1, value=label)
        write_money(ws, row, 2, value)
        row += 1

    row += 1
    src_header = row
    row = write_header_row(
        ws, src_header, ["Source", "Category", money_header("Net cash")]
    )

    for source_row in report.by_source:
        ws.cell(row=row, column=1, value=format_journal_source(source_row.source))
        ws.cell(row=row, column=2, value=source_row.category)
        write_money(ws, row, 3, source_row.net_cash_kurus)
        row += 1

    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, data_start),
        end_col=3,
        money_cols=(2, 3),
    )
    return save_workbook_to_bytes(wb)


def build_kdv_input_xlsx(report: KdvInputReportRead) -> bytes:
    wb, ws = create_workbook("KDV Input")
    header_row = _write_metadata(
        ws,
        title="KDV Input Report",
        entity_id=report.entity_id,
        date_label="Period",
        date_value=format_period(report.from_date, report.to_date),
        end_col=4,
    )

    data_start = write_header_row(
        ws,
        header_row,
        [
            "Rate (%)",
            money_header("Base"),
            money_header("VAT"),
            "Invoice count",
        ],
    )
    row = data_start

    for rate_row in report.rates:
        ws.cell(row=row, column=1, value=rate_row.rate_percent)
        write_money(ws, row, 2, rate_row.base_kurus)
        write_money(ws, row, 3, rate_row.vat_kurus)
        ws.cell(row=row, column=4, value=rate_row.invoice_count)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="TOTAL")
    write_money(ws, row, 2, report.total_base_kurus)
    write_money(ws, row, 3, report.total_vat_kurus)
    ws.cell(row=row, column=4, value=report.invoice_count)
    bold_row(ws, row, end_col=4)

    finish_data_table(
        ws, header_row=header_row, last_data_row=row, end_col=4, money_cols=(2, 3)
    )
    return save_workbook_to_bytes(wb)


def build_delivery_sales_xlsx(report: DeliverySalesReportRead) -> bytes:
    wb, ws = create_workbook("Delivery Sales")
    header_row = _write_metadata(
        ws,
        title="Delivery Sales Report",
        entity_id=report.entity_id,
        date_label="Period",
        date_value=format_period(report.from_date, report.to_date),
        end_col=4,
    )

    data_start = write_header_row(
        ws,
        header_row,
        [
            "Platform",
            "Active",
            money_header("Gross"),
            "Report count",
        ],
    )
    row = data_start

    for platform in report.platforms:
        ws.cell(row=row, column=1, value=platform.platform_name)
        ws.cell(row=row, column=2, value=platform.is_active)
        write_money(ws, row, 3, platform.gross_kurus)
        ws.cell(row=row, column=4, value=platform.report_count)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="TOTAL")
    write_money(ws, row, 3, report.total_gross_kurus)
    bold_row(ws, row, end_col=4)

    finish_data_table(
        ws, header_row=header_row, last_data_row=row, end_col=4, money_cols=(3,)
    )
    return save_workbook_to_bytes(wb)


def build_period_comparison_xlsx(report: PeriodComparisonRead) -> bytes:
    wb, ws = create_workbook("Period Comparison")
    header_row = _write_metadata(
        ws,
        title="Period Comparison",
        entity_id=report.entity_id,
        date_label="Current period",
        date_value=format_period(report.current_from, report.current_to),
        end_col=5,
    )
    ws.cell(row=2, column=3, value="Prior period")
    ws.cell(
        row=2,
        column=4,
        value=format_period(report.prior_from, report.prior_to),
    )

    data_start = write_header_row(
        ws,
        header_row,
        [
            "Metric",
            money_header("Current"),
            money_header("Prior"),
            money_header("Change"),
            "Change (%)",
        ],
    )
    row = data_start

    for metric in report.metrics:
        ws.cell(row=row, column=1, value=metric.label)
        write_money(ws, row, 2, metric.current_kurus)
        write_money(ws, row, 3, metric.prior_kurus)
        write_money(ws, row, 4, metric.change_kurus)
        ws.cell(
            row=row,
            column=5,
            value=metric.change_percent if metric.change_percent is not None else "",
        )
        row += 1

    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, data_start),
        end_col=5,
        money_cols=(2, 3, 4),
    )
    return save_workbook_to_bytes(wb)


#: Turkish letters have no ASCII equivalent that str.lower() knows about, and
#: "İ".lower() is "i̇" — an i with a combining dot, which is not what anyone
#: wants in a filename. Mapped explicitly before anything else runs.
_SLUG_TRANSLITERATIONS = str.maketrans(
    {
        "ı": "i", "İ": "i", "ş": "s", "Ş": "s", "ğ": "g", "Ğ": "g",
        "ü": "u", "Ü": "u", "ö": "o", "Ö": "o", "ç": "c", "Ç": "c",
    }
)


def filename_slug(value: str, *, max_length: int = 24) -> str:
    """A name safe to put in a filename: ascii, lowercase, hyphenated.

    "İndia Gate" becomes "india-gate". Returns "" for a name with nothing
    usable in it, so callers can leave the segment out rather than emit a
    stray hyphen.

    Truncation happens at a word boundary, never mid-word. Turkish trade names
    run long — "MEHMET ÖZKAN GIDA SANAYİ VE TİCARET LİMİTED ŞİRKETİ" is 51
    characters slugged — and a hard slice left filenames ending in
    "...ticaret-limi". Cutting at the last hyphen gives "mehmet-ozkan-gida",
    which is what anyone would have shortened it to by hand.

    A supplier long enough to be truncated can in principle collide with
    another sharing its opening words. That is tolerable for a download name:
    the file's own contents say which supplier it is, and the browser
    de-duplicates with (1), (2).
    """
    ascii_only = value.translate(_SLUG_TRANSLITERATIONS).lower()
    cleaned = "".join(ch if ch.isascii() and ch.isalnum() else "-" for ch in ascii_only)
    slug = "-".join(part for part in cleaned.split("-") if part)
    if len(slug) <= max_length:
        return slug

    cut = slug[:max_length]
    if "-" in cut:
        cut = cut[: cut.rindex("-")]
    # Drop a trailing stub like the "ve" in "zaina-turizm-ve" — a conjunction
    # left hanging off the end reads like the name was damaged.
    parts = [part for part in cut.split("-") if part]
    while len(parts) > 1 and len(parts[-1]) < 3:
        parts.pop()
    return "-".join(parts)


def period_segment(from_date: date, to_date: date) -> str:
    """`2026-06` for a whole calendar month, both dates otherwise."""
    whole_month = (
        from_date.day == 1
        and (from_date.year, from_date.month) == (to_date.year, to_date.month)
        and to_date.day == calendar.monthrange(to_date.year, to_date.month)[1]
    )
    if whole_month:
        return f"{from_date.year:04d}-{from_date.month:02d}"
    return f"{from_date}-{to_date}"


def export_filename(
    report_slug: str,
    *,
    entity_name: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    as_of: date | None = None,
    figures_suffix: str | None = None,
    extension: str = ".xlsx",
) -> str:
    """`india-gate-balance-sheet-2026-06-30.xlsx` (+ optional `-live` / `-as-closed`)."""
    slug = filename_slug(entity_name) if entity_name else ""
    stem = f"{slug}-{report_slug}" if slug else report_slug
    if as_of is not None:
        period = f"{as_of}"
    else:
        assert from_date is not None and to_date is not None
        period = period_segment(from_date, to_date)
    if figures_suffix:
        return f"{stem}-{period}-{figures_suffix}{extension}"
    return f"{stem}-{period}{extension}"
