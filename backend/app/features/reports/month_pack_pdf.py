"""Partner-facing PDF for the month books pack — readable summary of every book."""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.core.dates import format_period
from app.core.excel.labels import format_journal_source, format_staff_movement
from app.core.ledger.subledger_display import SubledgerDisplayKind
from app.core.listing import ListParams
from app.core.money import format_try
from app.core.pdf.fonts import (
    PDF_FONT_BOLD_NAME,
    PDF_FONT_NAME,
    assert_text_renderable,
    register_bundled_fonts,
)
from app.features.reports import cash_book as cash_book_report
from app.features.reports.month_pack import MonthPackBundle, cash_movement_rows
from app.features.reports.pdf_export import (
    _BAND,
    _BRAND_BLUE,
    _HAIRLINE,
    _INK,
    _MUTED,
    _NEGATIVE,
    _SLATE,
    _fmt_date,
    _period_text,
    header_elements,
    summary_band,
)
from app.features.reports.partner_sources import economic_source_value
from app.features.staff import service as staff_service

# PDF pages have finite height — cap detail sections; Excel remains the full export.
_LEDGER_LINES_CAP = 400
_EXPENSE_LINES_CAP = 600
_BOOK_LINES_CAP = 80


def _cell(value: object) -> str:
    text = "" if value is None else str(value)
    assert_text_renderable(text)
    return text


def _try_cell(minor: int | None) -> str:
    if minor is None:
        return ""
    return _cell(format_try(minor))


def _native_cell(minor: int | None) -> str:
    if minor is None:
        return ""
    sign = "-" if minor < 0 else ""
    abs_minor = abs(minor)
    whole, frac = divmod(abs_minor, 100)
    whole_str = f"{whole:,}".replace(",", ".")
    return _cell(f"{sign}{whole_str},{frac:02d}")


def _date_cell(value: date | None) -> str:
    if value is None:
        return ""
    return _cell(value.strftime("%d.%m.%Y"))


#: Order must match the section() calls below — drives the cover contents list.
_SECTION_NAMES = (
    "Summary",
    "Sales — day by day",
    "Expenses — by category",
    "Salaries",
    "Cash & bank books",
    "Foreign currency held",
    "Card clearing",
    "Profit and loss",
    "General ledger",
)


def render_month_pack_pdf(session: Session, bundle: MonthPackBundle) -> bytes:
    register_bundled_fonts()
    (
        colors,
        A4,
        landscape,
        ParagraphStyle,
        getSampleStyleSheet,
        cm,
        Paragraph,
        SimpleDocTemplate,
        PageBreak,
        Spacer,
        Table,
        TableStyle,
    ) = _require_reportlab()

    ctx = bundle.ctx
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "PackTitle",
        parent=styles["Title"],
        fontName=PDF_FONT_BOLD_NAME,
        fontSize=16,
        spaceAfter=6,
        textColor=colors.HexColor("#1D4ED8"),
    )
    section_style = ParagraphStyle(
        "PackSection",
        parent=styles["Heading2"],
        fontName=PDF_FONT_BOLD_NAME,
        fontSize=11.5,
        spaceBefore=2,
        spaceAfter=6,
        textColor=colors.HexColor(_INK),
    )
    body_style = ParagraphStyle(
        "PackBody",
        parent=styles["Normal"],
        fontName=PDF_FONT_NAME,
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#334155"),
    )
    small_style = ParagraphStyle(
        "PackSmall",
        parent=body_style,
        fontSize=8,
        leading=10,
    )
    subsection_style = ParagraphStyle(
        "PackSubsection",
        parent=body_style,
        fontSize=9,
        fontName=PDF_FONT_BOLD_NAME,
        textColor=colors.HexColor("#1D4ED8"),
    )
    note_style = ParagraphStyle(
        "PackNote",
        parent=body_style,
        fontSize=8,
        textColor=colors.HexColor("#64748B"),
    )
    money_in_style = ParagraphStyle(
        "PackMoneyIn",
        parent=small_style,
        textColor=colors.HexColor("#16A34A"),
    )
    money_out_style = ParagraphStyle(
        "PackMoneyOut",
        parent=small_style,
        textColor=colors.HexColor("#DC2626"),
    )

    def para(text: str, style: ParagraphStyle = body_style) -> Paragraph:
        safe = _cell(text).replace("&", "&amp;").replace("<", "&lt;")
        return Paragraph(safe, style)

    def section(title: str) -> list:
        return [Paragraph(f"<b>{_cell(title)}</b>", section_style), Spacer(1, 0.15 * cm)]

    def signed_amount(value: int):
        cell = _try_cell(value)
        if value > 0:
            return para(str(cell), money_in_style)
        if value < 0:
            return para(str(cell), money_out_style)
        return cell

    def table(
        rows: list[list],
        *,
        col_widths: list,
        header_rows: int = 1,
        bold_rows: list[int] | None = None,
        highlight_rows: list[tuple[int, str, str]] | None = None,
        amount_colors: list[tuple[int, int, str]] | None = None,
        repeat_rows: int | None = None,
    ) -> Table:
        wrapped: list[list] = []
        for r_idx, row in enumerate(rows):
            wrapped_row: list = []
            for c_idx, cell in enumerate(row):
                if isinstance(cell, Paragraph):
                    wrapped_row.append(cell)
                elif r_idx >= header_rows and c_idx in (1, 2, 3, 4) and len(row) > 2:
                    wrapped_row.append(para(str(cell), small_style))
                else:
                    wrapped_row.append(_cell(cell))
            wrapped.append(wrapped_row)
        tbl = Table(
            wrapped,
            repeatRows=repeat_rows if repeat_rows is not None else header_rows,
            colWidths=col_widths,
        )
        tbl.setStyle(
            _table_style(
                bold_rows=bold_rows,
                highlight_rows=highlight_rows,
                amount_colors=amount_colors,
            )
        )
        return tbl

    figures = (
        f"As closed on {ctx.closed_at}"
        if ctx.sealed and ctx.closed_at
        else "Live — month not closed"
    )
    generated = datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M UTC")

    dashboard = bundle.dashboard
    bridge = bundle.cash_bridge

    # ---- Cover page: same masthead as the standalone statements, then the
    # headline figures, the books-balance proof, and what's inside.
    elements: list = header_elements(
        title="Month Pack",
        entity_name=ctx.entity_name,
        period_label="Period",
        period_value=_period_text(ctx.from_date, ctx.to_date),
    )
    elements.extend(
        summary_band(
            [
                ("Sales", dashboard.sales.total_sales_kurus),
                ("Expenses", -abs(dashboard.total_expenses_kurus)),
                ("Net result", dashboard.net_result_kurus),
            ]
        )
    )

    movement_total = sum(amount for _label, amount in cash_movement_rows(bundle.cash_flow))
    balanced = bridge.balances_with_movements(movement_total)
    proof_rows = [
        [
            _cell(
                "Books balance"
                if balanced
                else "Books do not balance — review before filing"
            ),
            _cell(
                f"Opening {_try_cell(bridge.opening_cash_bank_kurus)} "
                f"+ movements = closing {_try_cell(bridge.closing_cash_bank_kurus)}"
            ),
        ]
    ]
    proof = Table(proof_rows, colWidths=["25%", "75%"])
    proof.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, 0), PDF_FONT_BOLD_NAME),
                ("FONTNAME", (1, 0), (1, 0), PDF_FONT_NAME),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                (
                    "BACKGROUND",
                    (0, 0),
                    (-1, -1),
                    colors.HexColor("#EAF3DE" if balanced else "#FCEBEB"),
                ),
                (
                    "TEXTCOLOR",
                    (0, 0),
                    (-1, -1),
                    colors.HexColor("#3B6D11" if balanced else _NEGATIVE),
                ),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    elements.append(proof)
    elements.append(Spacer(1, 0.4 * cm))

    contents_rows: list[list] = [[_cell("Contents"), _cell("")]]
    for index, name in enumerate(_SECTION_NAMES, start=1):
        contents_rows.append([_cell(f"{index} · {name}"), ""])
    contents = Table(contents_rows, colWidths=["60%", "40%"])
    contents.setStyle(_table_style(money_cols=()))
    elements.append(contents)
    elements.append(Spacer(1, 0.3 * cm))
    elements.append(para(f"Figures: {figures}", note_style))
    elements.append(para(f"Generated {generated}", note_style))

    elements.append(PageBreak())
    elements.extend(section("1 · Summary"))

    elements.append(para("Sales & result", subsection_style))
    elements.append(Spacer(1, 0.1 * cm))
    period_rows: list[list] = [[_cell("Description"), _cell("Amount")]]
    period_figures = [
        ("Cash sales", dashboard.sales.cash_sales_kurus),
        ("Card sales", dashboard.sales.pos_card_sales_kurus),
        ("Delivery sales", dashboard.sales.delivery_sales_kurus),
        ("Group / agency sales", dashboard.sales.group_sales_kurus),
        ("Other sales", dashboard.sales.other_sales_kurus),
        ("TOTAL SALES", dashboard.sales.total_sales_kurus),
        ("Total expenses", dashboard.total_expenses_kurus),
        ("NET RESULT", dashboard.net_result_kurus),
    ]
    for label, value in period_figures:
        period_rows.append([_cell(label), _try_cell(value)])
    elements.append(
        table(
            period_rows,
            col_widths=[10 * cm, 4.5 * cm],
            bold_rows=[6, 8],
            highlight_rows=[
                (6, "#DBEAFE", "#1D4ED8"),  # TOTAL SALES
                (
                    8,
                    "#DCFCE7" if dashboard.net_result_kurus >= 0 else "#FEE2E2",
                    "#16A34A" if dashboard.net_result_kurus >= 0 else "#DC2626",
                ),
            ],
        )
    )

    elements.append(Spacer(1, 0.3 * cm))
    elements.append(para("Cash & bank", subsection_style))
    elements.append(Spacer(1, 0.08 * cm))
    elements.append(
        para(
            f"Opening ({_fmt_date(bridge.opening_date)}) + lines below "
            f"= closing ({_fmt_date(bridge.closing_date)}). Books balance.",
            note_style,
        )
    )
    elements.append(Spacer(1, 0.1 * cm))
    cash_rows: list[list] = [[_cell("Description"), _cell("Amount")]]
    cash_bold: list[int] = []
    cash_highlights: list[tuple[int, str, str]] = []
    cash_rows.append(
        [
            _cell(f"Opening cash & bank ({_fmt_date(bridge.opening_date)})"),
            _try_cell(bridge.opening_cash_bank_kurus),
        ]
    )
    cash_bold.append(1)
    cash_highlights.append((1, "#DBEAFE", "#1D4ED8"))
    movement_rows = cash_movement_rows(bundle.cash_flow)
    if not movement_rows:
        cash_rows.append(
            [_cell("No cash or bank movements in this period"), _try_cell(0)]
        )
    else:
        for label, value in movement_rows:
            cash_rows.append([_cell(label), signed_amount(value)])
    close_idx = len(cash_rows)
    cash_rows.append(
        [
            _cell(f"Closing cash & bank ({_fmt_date(bridge.closing_date)})"),
            _try_cell(bridge.closing_cash_bank_kurus),
        ]
    )
    cash_bold.append(close_idx)
    cash_highlights.append((close_idx, "#DCFCE7", "#16A34A"))
    elements.append(
        table(
            cash_rows,
            col_widths=[10 * cm, 4.5 * cm],
            bold_rows=cash_bold,
            highlight_rows=cash_highlights,
        )
    )

    elements.append(Spacer(1, 0.3 * cm))
    elements.append(
        para(
            f"What we hold / owe ({_fmt_date(bridge.closing_date)})",
            subsection_style,
        )
    )
    elements.append(Spacer(1, 0.1 * cm))
    hold_rows: list[list] = [[_cell("Description"), _cell("Amount")]]
    for label, value in [
        ("Cash in hand", bridge.cash_in_hand_kurus),
        ("Bank", bridge.bank_balance_kurus),
        ("Owed to suppliers", dashboard.total_payables_kurus),
        ("Owed by customers", dashboard.total_receivables_kurus),
    ]:
        hold_rows.append([_cell(label), _try_cell(value)])
    if dashboard.fx_balances:
        hold_rows.append(["", ""])
        hold_rows.append([_cell("Foreign currency held (native)"), ""])
        for fx in dashboard.fx_balances:
            hold_rows.append(
                [
                    _cell(f"{fx.name} ({fx.currency})"),
                    _native_cell(fx.native_quantity),
                ]
            )
    elements.append(
        table(
            hold_rows,
            col_widths=[10 * cm, 4.5 * cm],
        )
    )
    elements.append(Spacer(1, 0.25 * cm))
    elements.append(
        para(
            "This PDF is the readable partner copy. Download Excel from the same "
            "button when you need to filter, sort, or total columns.",
            note_style,
        )
    )

    elements.append(PageBreak())
    elements.extend(section("2 · Sales — day by day"))
    sales_rows: list[list] = [
        [
            _cell("Date"),
            _cell("Sales"),
            _cell("Expenses"),
            _cell("Net"),
        ]
    ]
    for point in bundle.series.daily:
        sales_rows.append(
            [
                _date_cell(point.date),
                _try_cell(point.sales_kurus),
                _try_cell(point.expenses_kurus),
                _try_cell(point.net_kurus),
            ]
        )
    elements.append(
        table(
            sales_rows,
            col_widths=[2.5 * cm, 3.5 * cm, 3.5 * cm, 3.5 * cm],
        )
    )

    elements.append(PageBreak())
    elements.extend(section("3 · Expenses — by category"))
    cat_rows: list[list] = [
        [_cell("Account"), _cell("Entries"), _cell("Amount")]
    ]
    for total in bundle.register.account_totals:
        cat_rows.append(
            [
                _cell(f"{total.account_code} — {total.account_name}"),
                _cell(str(total.entry_count)),
                _try_cell(total.amount_kurus),
            ]
        )
    cat_rows.append(["", _cell("TOTAL"), _try_cell(bundle.register.total_kurus)])
    elements.append(
        table(
            cat_rows,
            col_widths=[11 * cm, 2 * cm, 3.5 * cm],
            bold_rows=[len(cat_rows) - 1],
        )
    )

    expense_lines = bundle.register.rows[:_EXPENSE_LINES_CAP]
    if expense_lines:
        elements.append(Spacer(1, 0.3 * cm))
        elements.extend(section("3 · Expenses — every line"))
        if len(bundle.register.rows) > len(expense_lines):
            elements.append(
                para(
                    f"Showing first {len(expense_lines)} of "
                    f"{len(bundle.register.rows)} lines — use Excel for the full list.",
                    note_style,
                )
            )
        exp_rows: list[list] = [
            [
                _cell("Date"),
                _cell("Account"),
                _cell("Description"),
                _cell("Recorded as"),
                _cell("Amount"),
            ]
        ]
        for line in expense_lines:
            exp_rows.append(
                [
                    _date_cell(line.entry_date),
                    _cell(f"{line.account_code} — {line.account_name}"),
                    _cell(line.description),
                    _cell(format_journal_source(line.source)),
                    _try_cell(line.amount_kurus),
                ]
            )
        elements.append(
            table(
                exp_rows,
                col_widths=[2.2 * cm, 4.5 * cm, 7.5 * cm, 3.2 * cm, 2.8 * cm],
            )
        )

    salary_rows = _collect_salary_rows(session, bundle)
    if salary_rows:
        elements.append(PageBreak())
        elements.extend(section("4 · Salaries — accruals, payments and advances"))
        elements.append(
            table(
                salary_rows,
                col_widths=[2.2 * cm, 3.5 * cm, 3 * cm, 5.5 * cm, 1.5 * cm, 2.5 * cm, 2.8 * cm],
            )
        )

    for account_id, name in bundle.drawer_ids:
        book = cash_book_report.get_cash_book(
            session,
            bundle.ctx.entity_id,
            account_id,
            bundle.ctx.from_date,
            bundle.ctx.to_date,
        )
        elements.extend(
            _account_book_section(
                book,
                heading=f"5 · Cash book — {name}",
                section=section,
                table=table,
                note_style=note_style,
                para=para,
                PageBreak=PageBreak,
                Spacer=Spacer,
                cm=cm,
            )
        )

    for account_id, name in bundle.bank_ids:
        book = cash_book_report.get_cash_book(
            session,
            bundle.ctx.entity_id,
            account_id,
            bundle.ctx.from_date,
            bundle.ctx.to_date,
        )
        elements.extend(
            _account_book_section(
                book,
                heading=f"5 · Bank book — {name}",
                section=section,
                table=table,
                note_style=note_style,
                para=para,
                PageBreak=PageBreak,
                Spacer=Spacer,
                cm=cm,
            )
        )

    if bundle.dashboard.fx_balances:
        elements.append(PageBreak())
        elements.extend(section("6 · Foreign currency held"))
        fx_rows: list[list] = [
            [_cell("Wallet"), _cell("Currency"), _cell("Amount held"), _cell("TRY cost")]
        ]
        for fx in bundle.dashboard.fx_balances:
            fx_rows.append(
                [
                    _cell(fx.name),
                    _cell(fx.currency),
                    _native_cell(fx.native_quantity),
                    _try_cell(fx.try_cost_kurus),
                ]
            )
        elements.append(
            table(
                fx_rows,
                col_widths=[5 * cm, 2 * cm, 3.5 * cm, 3.5 * cm],
            )
        )

    elements.append(PageBreak())
    elements.extend(section("7 · Card clearing"))
    clearing = bundle.clearing
    card_rows: list[list] = [[_cell("Description"), _cell("Amount")]]
    for label, value in [
        ("Opening in transit", clearing.opening_in_transit_kurus),
        ("Card sales in period", clearing.period_card_sales_kurus),
        ("Deposits and clearances", clearing.period_clearances_kurus),
        ("Closing in transit", clearing.closing_in_transit_kurus),
        ("Commission recorded", clearing.commission_recorded_kurus),
        ("Total card sales (all time)", clearing.total_card_sales_kurus),
    ]:
        card_rows.append([_cell(label), _try_cell(value)])
    elements.append(table(card_rows, col_widths=[10 * cm, 4.5 * cm]))

    elements.append(PageBreak())
    elements.extend(section("8 · Profit and loss"))
    pl = bundle.profit_and_loss
    pl_rows: list[list] = [[_cell("Code"), _cell("Account"), _cell("Type"), _cell("Amount")]]
    for account in pl.accounts:
        pl_rows.append(
            [
                _cell(account.code),
                _cell(account.name_en),
                _cell(account.account_type.value),
                _try_cell(account.amount_kurus),
            ]
        )
    pl_rows.append(["", "", _cell("TOTAL REVENUE"), _try_cell(pl.total_revenue_kurus)])
    pl_rows.append(["", "", _cell("TOTAL EXPENSES"), _try_cell(pl.total_expenses_kurus)])
    pl_rows.append(["", "", _cell("NET INCOME"), _try_cell(pl.net_income_kurus)])
    elements.append(
        table(
            pl_rows,
            col_widths=[2 * cm, 7 * cm, 2.5 * cm, 3.5 * cm],
            bold_rows=[len(pl_rows) - 3, len(pl_rows) - 2, len(pl_rows) - 1],
        )
    )

    elements.append(PageBreak())
    elements.extend(section("9 · General ledger"))
    ledger_line_count = sum(len(entry.lines) for entry in bundle.entries)
    shown = 0
    ledger_rows: list[list] = [
        [
            _cell("Date"),
            _cell("Description"),
            _cell("Recorded as"),
            _cell("Account"),
            _cell("Debit"),
            _cell("Credit"),
        ]
    ]
    truncated = False
    for entry in bundle.entries:
        recorded_as = format_journal_source(
            economic_source_value(
                entry.source, entry.id, bundle.rule_auto_map
            )
        )
        for line in entry.lines:
            if shown >= _LEDGER_LINES_CAP:
                truncated = True
                break
            ledger_rows.append(
                [
                    _date_cell(entry.entry_date),
                    _cell(entry.description),
                    _cell(recorded_as),
                    _cell(bundle.account_labels.get(line.account_id, str(line.account_id))),
                    _try_cell(line.amount_kurus if line.side.value.lower() == "debit" else None),
                    _try_cell(None if line.side.value.lower() == "debit" else line.amount_kurus),
                ]
            )
            shown += 1
        if truncated:
            break
    if truncated:
        elements.append(
            para(
                f"Showing first {shown} of {ledger_line_count} ledger lines — "
                "use Excel for the full export.",
                note_style,
            )
        )
    elements.append(
        table(
            ledger_rows,
            col_widths=[2.2 * cm, 5.5 * cm, 2.8 * cm, 4.5 * cm, 2.5 * cm, 2.5 * cm],
        )
    )

    buffer = __import__("io").BytesIO()
    pagesize = landscape(A4)
    margin = 1.2 * cm
    footer_left = (
        f"{ctx.entity_name} · Month Pack · "
        f"{_period_text(ctx.from_date, ctx.to_date)}"
    )

    def _draw_footer(canvas, _doc) -> None:
        canvas.saveState()
        width, _height = pagesize
        y = margin * 0.55
        canvas.setStrokeColor(colors.HexColor(_HAIRLINE))
        canvas.setLineWidth(0.5)
        canvas.line(margin, y + 9, width - margin, y + 9)
        canvas.setFont(PDF_FONT_NAME, 7)
        canvas.setFillColor(colors.HexColor(_MUTED))
        canvas.drawString(margin, y, footer_left)
        canvas.drawRightString(
            width - margin, y, f"Mizan · Page {canvas.getPageNumber()}"
        )
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagesize,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin * 1.25,
        title=f"Month Pack {format_period(ctx.from_date, ctx.to_date)}",
        author="Mizan",
    )
    doc.build(elements, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    return buffer.getvalue()


def _collect_salary_rows(session: Session, bundle: MonthPackBundle) -> list[list]:
    header = [
        _cell("Date"),
        _cell("Employee"),
        _cell("Movement"),
        _cell("Description"),
        _cell("Currency"),
        _cell("Amount"),
        _cell("TRY cost"),
    ]
    rows: list[list] = [header]
    employees, _ = staff_service.list_employees(
        session,
        bundle.ctx.entity_id,
        include_inactive=True,
        list_params=ListParams(limit=500),
    )
    for employee in employees:
        ledger = staff_service.get_staff_ledger(session, bundle.ctx.entity_id, employee.id)
        raw_currency = employee.pay_currency
        currency = (
            raw_currency.value if hasattr(raw_currency, "value") else str(raw_currency)
        )
        for entry in ledger.entries:
            if not (bundle.ctx.from_date <= entry.movement_date <= bundle.ctx.to_date):
                continue
            if entry.display_kind != SubledgerDisplayKind.EFFECTIVE:
                continue
            amount = (
                _try_cell(entry.amount_minor)
                if currency == "TRY"
                else _native_cell(entry.amount_minor)
            )
            try_cost = (
                _try_cell(entry.try_cost_kurus)
                if entry.try_cost_kurus is not None
                else ""
            )
            rows.append(
                [
                    _date_cell(entry.movement_date),
                    _cell(employee.name),
                    _cell(format_staff_movement(entry.movement_type)),
                    _cell(entry.description),
                    _cell(currency),
                    amount,
                    try_cost,
                ]
            )
    return rows if len(rows) > 1 else []


def _account_book_section(
    book,
    *,
    heading: str,
    section,
    table,
    note_style,
    para,
    PageBreak,
    Spacer,
    cm,
) -> list:
    lines = book.rows[:_BOOK_LINES_CAP]
    out: list = [PageBreak()]
    out.extend(section(heading))
    out.append(
        para(
            f"Opening {_try_cell(book.opening_kurus)} · "
            f"Closing {_try_cell(book.closing_kurus)}",
            note_style,
        )
    )
    if len(book.rows) > len(lines):
        out.append(
            para(
                f"Showing first {len(lines)} of {len(book.rows)} movements — "
                "use Excel for the full book.",
                note_style,
            )
        )
    rows: list[list] = [
        [
            _cell("Date"),
            _cell("Description"),
            _cell("Recorded as"),
            _cell("In"),
            _cell("Out"),
            _cell("Balance"),
        ]
    ]
    for line in lines:
        rows.append(
            [
                _date_cell(line.entry_date),
                _cell(line.description),
                _cell(format_journal_source(line.source)),
                _try_cell(line.in_kurus or None),
                _try_cell(line.out_kurus or None),
                _try_cell(line.balance_kurus),
            ]
        )
    out.append(Spacer(1, 0.15 * cm))
    out.append(
        table(
            rows,
            col_widths=[2.2 * cm, 7 * cm, 3 * cm, 2.5 * cm, 2.5 * cm, 2.8 * cm],
        )
    )
    return out


def _require_reportlab():
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            PageBreak,
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
    except ImportError as exc:
        from app.features.reports.pdf_export import PdfExportDependencyError

        raise PdfExportDependencyError(
            "reportlab is required for PDF export; install project dependencies"
        ) from exc
    return (
        colors,
        A4,
        landscape,
        ParagraphStyle,
        getSampleStyleSheet,
        cm,
        Paragraph,
        SimpleDocTemplate,
        PageBreak,
        Spacer,
        Table,
        TableStyle,
    )


def _table_style(
    *,
    header_rows: int = 1,
    bold_rows: list[int] | None = None,
    highlight_rows: list[tuple[int, str, str]] | None = None,
    amount_colors: list[tuple[int, int, str]] | None = None,
    section_rows: list[int] | None = None,
    total_rows: list[int] | None = None,
    money_cols: tuple[int, ...] = (-1,),
):
    """Same accounting look as the standalone statements (pdf_export.py).

    Hairline rules instead of a grid, small-caps headers, right-aligned money,
    banded section rows, ruled grand totals. ``highlight_rows`` is kept for the
    pack's semantic tints (net result green/red) but now renders as a soft band
    rather than a saturated fill.
    """
    colors, *_rest, TableStyle = _require_reportlab()
    commands: list = [
        ("FONTNAME", (0, 0), (-1, -1), PDF_FONT_NAME),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor(_SLATE)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LINEBELOW", (0, header_rows - 1), (-1, -2), 0.4, colors.HexColor(_HAIRLINE)),
    ]
    for row in range(header_rows):
        commands.extend(
            [
                ("FONTNAME", (0, row), (-1, row), PDF_FONT_BOLD_NAME),
                ("FONTSIZE", (0, row), (-1, row), 7),
                ("TEXTCOLOR", (0, row), (-1, row), colors.HexColor(_MUTED)),
            ]
        )
    commands.append(
        (
            "LINEBELOW",
            (0, header_rows - 1),
            (-1, header_rows - 1),
            1,
            colors.HexColor(_SLATE),
        )
    )
    for col in money_cols:
        commands.append(("ALIGN", (col, 0), (col, -1), "RIGHT"))
    for row in section_rows or []:
        commands.extend(
            [
                ("BACKGROUND", (0, row), (-1, row), colors.HexColor(_BAND)),
                ("FONTNAME", (0, row), (-1, row), PDF_FONT_BOLD_NAME),
                ("TEXTCOLOR", (0, row), (-1, row), colors.HexColor(_BRAND_BLUE)),
            ]
        )
    for row in bold_rows or []:
        commands.extend(
            [
                ("FONTNAME", (0, row), (-1, row), PDF_FONT_BOLD_NAME),
                ("TEXTCOLOR", (0, row), (-1, row), colors.HexColor(_INK)),
            ]
        )
    for row, _bg, fg in highlight_rows or []:
        commands.extend(
            [
                ("BACKGROUND", (0, row), (-1, row), colors.HexColor(_BAND)),
                ("FONTNAME", (0, row), (-1, row), PDF_FONT_BOLD_NAME),
                ("TEXTCOLOR", (0, row), (-1, row), colors.HexColor(fg)),
                ("LINEABOVE", (0, row), (-1, row), 1, colors.HexColor(_SLATE)),
            ]
        )
    for row in total_rows or []:
        commands.extend(
            [
                ("FONTNAME", (0, row), (-1, row), PDF_FONT_BOLD_NAME),
                ("FONTSIZE", (0, row), (-1, row), 9),
                ("TEXTCOLOR", (0, row), (-1, row), colors.HexColor(_INK)),
                ("LINEABOVE", (0, row), (-1, row), 1.1, colors.HexColor(_SLATE)),
                ("TOPPADDING", (0, row), (-1, row), 6),
            ]
        )
    for row, col, fg in amount_colors or []:
        commands.append(("TEXTCOLOR", (col, row), (col, row), colors.HexColor(fg)))
    return TableStyle(commands)
