"""General ledger standalone Excel — By account + All entries.

Reuses shared Excel helpers and the same ledger list the /reports/ledger page
reads. Closed months stamp sealed figures and an -as-closed filename.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.dates import format_period
from app.core.excel.labels import format_journal_source
from app.core.excel.workbook import (
    add_sheet,
    create_workbook,
    finish_data_table,
    money_header,
    save_workbook_to_bytes,
    write_date,
    write_header_row,
    write_money,
    write_sheet_title,
)
from app.core.ledger.balances import balance_as_of_kurus, debit_credit_activity_kurus
from app.core.ledger.models import JournalEntrySource, JournalEntryStatus
from app.core.listing import ListParams, MAX_LIST_LIMIT
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.ledger import service as ledger_service
from app.features.ledger.schema import JournalEntryOut
from app.features.reports import financial_statements
from app.features.reports.excel_export import period_segment
from app.features.reports.partner_sources import (
    economic_source_value,
    load_rule_auto_economic_sources,
)

__all__ = ["build_general_ledger_xlsx", "general_ledger_filename"]


def general_ledger_filename(
    from_date: date,
    to_date: date,
    *,
    sealed: bool,
    entity_name: str | None = None,
) -> str:
    from app.features.reports.excel_export import filename_slug

    suffix = "as-closed" if sealed else "live"
    slug = filename_slug(entity_name) if entity_name else ""
    stem = f"{slug}-general-ledger" if slug else "general-ledger"
    return f"{stem}-{period_segment(from_date, to_date)}-{suffix}.xlsx"


def _fetch_all_entries(
    session: Session,
    entity_id: uuid.UUID,
    *,
    from_date: date,
    to_date: date,
    status: JournalEntryStatus | None,
    source: JournalEntrySource | None,
    q: str | None,
    effective_only: bool,
) -> list[JournalEntryOut]:
    items: list[JournalEntryOut] = []
    offset = 0
    while True:
        batch, total = ledger_service.list_journal_entries(
            session,
            entity_id,
            status=status,
            source=source,
            entry_date_from=from_date,
            entry_date_to=to_date,
            q=q,
            effective_only=effective_only,
            list_params=ListParams(limit=MAX_LIST_LIMIT, offset=offset),
        )
        items.extend(batch)
        offset += len(batch)
        if offset >= total or not batch:
            break
    return items


def _write_by_account(
    ws,
    session: Session,
    *,
    account_ids: set[uuid.UUID],
    from_date: date,
    to_date: date,
    entity_name: str,
    filter_note: str,
) -> None:
    write_sheet_title(
        ws,
        "General ledger — by account",
        subtitles=[
            f"{entity_name} · {format_period(from_date, to_date)}",
            filter_note,
        ],
        end_col=6,
    )
    header_row = 4
    data_start = write_header_row(
        ws,
        header_row,
        [
            "Code",
            "Name",
            money_header("Opening"),
            money_header("Debits"),
            money_header("Credits"),
            money_header("Closing"),
        ],
    )
    accounts = list(
        session.scalars(
            select(Account)
            .where(Account.id.in_(account_ids))
            .order_by(Account.code)
        )
    ) if account_ids else []

    opening_as_of = from_date - timedelta(days=1)
    row = data_start
    for account in accounts:
        opening = balance_as_of_kurus(session, account, opening_as_of)
        closing = balance_as_of_kurus(session, account, to_date)
        debits, credits = debit_credit_activity_kurus(
            session, account.id, from_date, to_date
        )
        # Sign per account normal: opening + period activity = closing.
        period = (
            debits - credits
            if account.normal_balance == AccountNormalBalance.DEBIT
            else credits - debits
        )
        if opening + period != closing:
            raise AssertionError(
                f"GL tie failed for {account.code}: "
                f"opening {opening} + period {period} != closing {closing}"
            )
        ws.cell(row=row, column=1, value=account.code)
        ws.cell(row=row, column=2, value=account.name_en or account.name_tr)
        write_money(ws, row, 3, opening)
        write_money(ws, row, 4, debits)
        write_money(ws, row, 5, credits)
        write_money(ws, row, 6, closing)
        row += 1

    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, data_start),
        end_col=6,
        money_cols=(3, 4, 5, 6),
    )


def _write_all_entries(
    ws,
    entries: list[JournalEntryOut],
    account_labels: dict[uuid.UUID, str],
    rule_auto_map: dict,
    *,
    entity_name: str,
    from_date: date,
    to_date: date,
    filter_note: str,
) -> int:
    write_sheet_title(
        ws,
        "General ledger — all entries",
        subtitles=[
            f"{entity_name} · {format_period(from_date, to_date)}",
            filter_note,
        ],
        end_col=6,
    )
    header_row = 4
    data_start = write_header_row(
        ws,
        header_row,
        [
            "Date",
            "Description",
            "Source",
            "Account",
            money_header("Debit"),
            money_header("Credit"),
        ],
    )
    row = data_start
    line_count = 0
    for entry in entries:
        recorded_as = format_journal_source(
            economic_source_value(entry.source, entry.id, rule_auto_map)
        )
        for line in entry.lines:
            write_date(ws, row, 1, entry.entry_date)
            ws.cell(row=row, column=2, value=entry.description)
            ws.cell(row=row, column=3, value=recorded_as)
            ws.cell(
                row=row,
                column=4,
                value=account_labels.get(line.account_id, str(line.account_id)),
            )
            debit = line.side.value.lower() == "debit"
            write_money(ws, row, 5, line.amount_kurus if debit else None)
            write_money(ws, row, 6, None if debit else line.amount_kurus)
            row += 1
            line_count += 1

    finish_data_table(
        ws,
        header_row=header_row,
        last_data_row=max(row - 1, data_start),
        end_col=6,
        money_cols=(5, 6),
        freeze_panes=f"A{data_start}",
        autofilter=True,
    )
    return line_count


def build_general_ledger_xlsx(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    *,
    status: JournalEntryStatus | None = None,
    source: JournalEntrySource | None = None,
    q: str | None = None,
    effective_only: bool = True,
) -> tuple[bytes, str, int]:
    entity = entity_service.get_entity(session, entity_id)
    if entity is None:
        raise LookupError("Entity not found")
    if to_date < from_date:
        raise ValueError("to must not be before from")

    profit_and_loss = financial_statements.get_profit_and_loss(
        session, entity_id, from_date, to_date
    )
    sealed = profit_and_loss.source == financial_statements.VIEW_AS_CLOSED

    entries = _fetch_all_entries(
        session,
        entity_id,
        from_date=from_date,
        to_date=to_date,
        status=status,
        source=source,
        q=q,
        effective_only=effective_only,
    )

    filter_bits: list[str] = []
    if source is not None:
        filter_bits.append(f"Source: {format_journal_source(source.value)}")
    if status is not None:
        filter_bits.append(f"Status: {status.value}")
    if q:
        filter_bits.append(f"Search: {q}")
    if effective_only and status is None:
        filter_bits.append("Effective entries only")
    filter_note = " · ".join(filter_bits) if filter_bits else "All sources"

    account_ids: set[uuid.UUID] = set()
    for entry in entries:
        for line in entry.lines:
            account_ids.add(line.account_id)

    with entity_context(session, entity_id):
        require_entity_context()
        account_labels = {
            a.id: f"{a.code} — {a.name_en or a.name_tr}"
            for a in session.scalars(select(Account))
        }
        rule_auto_map = load_rule_auto_economic_sources(
            session, [entry.id for entry in entries]
        )

        wb, by_account_ws = create_workbook("By account")
        _write_by_account(
            by_account_ws,
            session,
            account_ids=account_ids,
            from_date=from_date,
            to_date=to_date,
            entity_name=entity.name,
            filter_note=filter_note,
        )
        line_count = _write_all_entries(
            add_sheet(wb, "All entries"),
            entries,
            account_labels,
            rule_auto_map,
            entity_name=entity.name,
            from_date=from_date,
            to_date=to_date,
            filter_note=filter_note,
        )

    filename = general_ledger_filename(
        from_date, to_date, sealed=sealed, entity_name=entity.name
    )
    return save_workbook_to_bytes(wb), filename, line_count
