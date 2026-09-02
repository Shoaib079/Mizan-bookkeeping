"""FX hub ledger export — collect rows and build files (kept out of service.py)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.core.listing import ListParams
from app.features.banking import service as banking_service
from app.features.fx.schema import FxLedgerEntryRead
from app.features.fx.service import get_fx_ledger

FX_HUB_CURRENCY_FILTERS = frozenset({"USD", "EUR", "GBP"})


def _fx_hub_wallets(
    session: Session,
    entity_id: uuid.UUID,
    *,
    wallet_filter: str | None,
):
    tree = banking_service.get_account_tree(session, entity_id, include_inactive=False)
    fx = tree.foreign_currency
    wallets = [
        *fx.usd.accounts,
        *fx.eur.accounts,
        *fx.gbp.accounts,
    ]
    wallets = [wallet for wallet in wallets if wallet.is_active]
    if not wallet_filter or wallet_filter == "all":
        return wallets
    upper = wallet_filter.upper()
    if upper in FX_HUB_CURRENCY_FILTERS:
        return [wallet for wallet in wallets if wallet.currency == upper]
    try:
        wallet_id = uuid.UUID(wallet_filter)
    except ValueError:
        return wallets
    return [wallet for wallet in wallets if wallet.id == wallet_id]


def _wallet_filter_label(
    wallets: list,
    wallet_filter: str | None,
) -> str:
    if not wallet_filter or wallet_filter == "all":
        return "All wallets"
    upper = wallet_filter.upper()
    if upper in FX_HUB_CURRENCY_FILTERS:
        return upper
    if len(wallets) == 1:
        return wallets[0].name
    return wallet_filter


def _fetch_all_fx_ledger(
    session: Session,
    entity_id: uuid.UUID,
    fx_money_account_id: uuid.UUID,
    *,
    from_date: date,
    to_date: date,
) -> list[FxLedgerEntryRead]:
    from app.core.listing import MAX_LIST_LIMIT

    items: list[FxLedgerEntryRead] = []
    offset = 0
    while True:
        batch, total = get_fx_ledger(
            session,
            entity_id,
            fx_money_account_id,
            from_date=from_date,
            to_date=to_date,
            list_params=ListParams(limit=MAX_LIST_LIMIT, offset=offset),
        )
        items.extend(batch)
        offset += len(batch)
        if offset >= total or not batch:
            break
    return items


def collect_fx_hub_ledger_rows(
    session: Session,
    entity_id: uuid.UUID,
    *,
    from_date: date,
    to_date: date,
    wallet_filter: str | None = None,
) -> tuple[list, str]:
    from app.core.ledger.subledger_display import is_effective_subledger_row
    from app.features.fx.ledger_export import FxLedgerExportRow

    if from_date > to_date:
        raise ValueError("from must be on or before to")

    wallets = _fx_hub_wallets(session, entity_id, wallet_filter=wallet_filter)
    wallet_label = _wallet_filter_label(wallets, wallet_filter)
    rows: list[FxLedgerExportRow] = []
    for wallet in wallets:
        currency = wallet.currency or "USD"
        for entry in _fetch_all_fx_ledger(
            session,
            entity_id,
            wallet.id,
            from_date=from_date,
            to_date=to_date,
        ):
            if not is_effective_subledger_row(entry.display_kind):
                continue
            rows.append(
                FxLedgerExportRow(
                    movement_date=entry.movement_date,
                    wallet_name=wallet.name,
                    wallet_currency=currency,
                    movement_type=entry.movement_type.value.replace("_", " ").title(),
                    description=entry.description,
                    native_quantity=entry.native_quantity,
                    try_cost_kurus=entry.try_cost_kurus,
                )
            )
    rows.sort(key=lambda row: (row.movement_date, row.wallet_name, row.description))
    return rows, wallet_label


def export_fx_hub_ledger(
    session: Session,
    entity_id: uuid.UUID,
    *,
    from_date: date,
    to_date: date,
    wallet_filter: str | None = None,
    pdf: bool = False,
) -> tuple[bytes, str]:
    from app.features.entities import service as entity_service
    from app.features.fx import ledger_export
    from app.features.reports.excel_export import export_filename

    rows, wallet_label = collect_fx_hub_ledger_rows(
        session,
        entity_id,
        from_date=from_date,
        to_date=to_date,
        wallet_filter=wallet_filter,
    )
    entity = entity_service.get_entity(session, entity_id)
    entity_name = entity.name if entity is not None else "Mizan"
    export = ledger_export.FxLedgerExport(
        entity_name=entity_name,
        from_date=from_date,
        to_date=to_date,
        wallet_label=wallet_label,
        rows=rows,
    )
    if pdf:
        data = ledger_export.build_fx_ledger_pdf(export)
        extension = ".pdf"
    else:
        data = ledger_export.build_fx_ledger_xlsx(export)
        extension = ".xlsx"
    filename = export_filename(
        "fx-ledger",
        entity_name=entity_name,
        from_date=from_date,
        to_date=to_date,
        extension=extension,
    )
    return data, filename
