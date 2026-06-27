"""FX purchase service — thin wrapper over posting boundary (Decisions §15)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.fx.average_cost import compute_spend_at_average_cost
from app.core.fx.models import FxLedgerEntry
from app.core.fx.spend_posting import (
    InvalidFxSpendError,
    build_fx_conversion_posting_lines,
    build_fx_expense_spend_posting_lines,
    post_fx_conversion,
    post_fx_expense_spend,
)
from app.core.ledger.correction import CorrectionNotFoundError, correct_fx_conversion_or_spend, correct_fx_purchase
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import PostingLine
from app.db.session import entity_context, require_entity_context
from app.core.chart_of_accounts.default_chart import FX_GAIN_CODE, FX_LOSS_CODE

from app.core.listing import ListParams

from app.core.fx import ledger as fx_ledger
from app.core.fx.posting import post_fx_purchase
from app.core.fx.spend_posting import InvalidFxSpendError, post_fx_conversion, post_fx_expense_spend
from app.features.banking import service as banking_service
from app.features.fx.schema import (
    FxBalanceRead,
    FxConversionCreate,
    FxConversionResponse,
    FxExpenseSpendCreate,
    FxExpenseSpendResponse,
    FxLedgerEntryRead,
    FxPurchaseCreate,
    FxPurchaseCorrect,
    FxPurchaseCorrectOut,
    FxPurchaseResponse,
    FxLedgerEntryCorrect,
    FxLedgerEntryCorrectOut,
)


def _to_ledger_read(entry, *, journal_source: JournalEntrySource | None = None) -> FxLedgerEntryRead:
    data = FxLedgerEntryRead.model_validate(entry)
    if journal_source is not None:
        return data.model_copy(update={"journal_source": journal_source})
    return data


def create_fx_purchase(
    session: Session,
    entity_id: uuid.UUID,
    payload: FxPurchaseCreate,
) -> FxPurchaseResponse:
    result = post_fx_purchase(
        session,
        entity_id,
        fx_money_account_id=payload.fx_money_account_id,
        try_cash_money_account_id=payload.try_cash_money_account_id,
        native_quantity=payload.native_quantity,
        try_cost_kurus=payload.try_cost_kurus,
        purchase_date=payload.purchase_date,
        description=payload.description,
        actor_id=payload.actor_id,
    )
    return FxPurchaseResponse(
        journal_entry_id=result.journal_entry.id,
        fx_ledger_entry=_to_ledger_read(result.fx_ledger_entry),
    )


def correct_fx_purchase_entry(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: FxPurchaseCorrect,
) -> FxPurchaseCorrectOut:
    result = correct_fx_purchase(
        session,
        entity_id,
        journal_entry_id,
        purchase_date=payload.purchase_date,
        native_quantity=payload.native_quantity,
        try_cost_kurus=payload.try_cost_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        fx_money_account_id=payload.fx_money_account_id,
        try_cash_money_account_id=payload.try_cash_money_account_id,
        reason=payload.reason,
        void_date=payload.void_date,
        period_unlock_reason=payload.period_unlock_reason,
    )
    with entity_context(session, entity_id):
        new_row = session.scalar(
            select(FxLedgerEntry).where(
                FxLedgerEntry.journal_entry_id == result.corrected.id
            )
        )
    if new_row is None:
        raise CorrectionNotFoundError("corrected FX ledger entry not found")
    return FxPurchaseCorrectOut(
        original_journal_entry_id=result.original.id,
        reversal_journal_entry_id=result.reversal.id,
        corrected_journal_entry_id=result.corrected.id,
        fx_ledger_entry=_to_ledger_read(new_row),
    )


def create_fx_conversion(
    session: Session,
    entity_id: uuid.UUID,
    payload: FxConversionCreate,
) -> FxConversionResponse:
    result = post_fx_conversion(
        session,
        entity_id,
        fx_money_account_id=payload.fx_money_account_id,
        try_money_account_id=payload.try_money_account_id,
        native_quantity=payload.native_quantity,
        try_received_kurus=payload.try_received_kurus,
        conversion_date=payload.conversion_date,
        description=payload.description,
        actor_id=payload.actor_id,
    )
    return FxConversionResponse(
        journal_entry_id=result.journal_entry.id,
        fx_ledger_entry=_to_ledger_read(result.fx_ledger_entry),
        try_cost_kurus=result.try_cost_kurus,
        realized_gain_kurus=result.realized_gain_kurus,
    )


def create_fx_expense_spend(
    session: Session,
    entity_id: uuid.UUID,
    payload: FxExpenseSpendCreate,
) -> FxExpenseSpendResponse:
    result = post_fx_expense_spend(
        session,
        entity_id,
        fx_money_account_id=payload.fx_money_account_id,
        expense_account_id=payload.expense_account_id,
        native_quantity=payload.native_quantity,
        spend_date=payload.spend_date,
        description=payload.description,
        actor_id=payload.actor_id,
    )
    return FxExpenseSpendResponse(
        journal_entry_id=result.journal_entry.id,
        fx_ledger_entry=_to_ledger_read(result.fx_ledger_entry),
        try_cost_kurus=result.try_cost_kurus,
    )


def get_fx_ledger(
    session: Session,
    entity_id: uuid.UUID,
    fx_money_account_id: uuid.UUID,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    min_amount: int | None = None,
    max_amount: int | None = None,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[FxLedgerEntryRead], int]:
    entries, total = fx_ledger.list_fx_ledger_entries(
        session,
        entity_id,
        fx_money_account_id,
        from_date=from_date,
        to_date=to_date,
        min_amount=min_amount,
        max_amount=max_amount,
        q=q,
        list_params=list_params,
    )
    with entity_context(session, entity_id):
        from app.core.ledger.models import JournalEntry

        reads: list[FxLedgerEntryRead] = []
        for entry in entries:
            journal = session.get(JournalEntry, entry.journal_entry_id)
            reads.append(
                _to_ledger_read(
                    entry,
                    journal_source=journal.source if journal is not None else None,
                )
            )
    return reads, total


def get_fx_balance(
    session: Session,
    entity_id: uuid.UUID,
    fx_money_account_id: uuid.UUID,
) -> FxBalanceRead:
    account = banking_service.get_money_account(session, entity_id, fx_money_account_id)
    if account.currency is None:
        raise LookupError("FX money account not found")

    native_quantity = fx_ledger.native_quantity_balance(
        session, entity_id, fx_money_account_id
    )
    try_cost = fx_ledger.try_cost_balance_kurus(session, entity_id, fx_money_account_id)

    return FxBalanceRead(
        fx_money_account_id=fx_money_account_id,
        currency=account.currency,
        native_quantity=native_quantity,
        try_cost_kurus=try_cost,
        gl_balance_kurus=account.balance_kurus,
    )


def _fx_row_for_correction(
    session: Session, journal_entry_id: uuid.UUID
) -> tuple[FxLedgerEntry, JournalEntry]:
    fx_row = session.scalar(
        select(FxLedgerEntry).where(FxLedgerEntry.journal_entry_id == journal_entry_id)
    )
    if fx_row is None:
        raise CorrectionNotFoundError("FX ledger entry not found for journal entry")
    journal = session.get(JournalEntry, journal_entry_id)
    if journal is None:
        raise CorrectionNotFoundError("journal entry not found")
    if journal.source == JournalEntrySource.FX_PURCHASE:
        raise CorrectionNotFoundError("use FX purchase correction endpoint for purchases")
    if journal.source not in {
        JournalEntrySource.FX_CONVERSION,
        JournalEntrySource.FX_EXPENSE_SPEND,
    }:
        raise CorrectionNotFoundError("journal entry is not an FX conversion or spend")
    return fx_row, journal


def correct_fx_conversion_or_spend_entry(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: FxLedgerEntryCorrect,
) -> FxLedgerEntryCorrectOut:
    from app.core.fx import spend_posting as fx_spend_posting
    from app.core.fx.types import FxMovementType
    from app.features.entities import service as entity_service

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        fx_row, journal = _fx_row_for_correction(session, journal_entry_id)
        fx_account_id = payload.fx_money_account_id or fx_row.fx_money_account_id
        native_quantity = payload.native_quantity

        if journal.source == JournalEntrySource.FX_CONVERSION:
            if payload.try_received_kurus is None:
                raise ValueError("try_received_kurus required for FX conversion correction")
            if payload.try_money_account_id is None:
                raise ValueError("try_money_account_id required for FX conversion correction")
            _, fx_gl = fx_spend_posting._validate_fx_money_account(
                session, entity_id, fx_account_id
            )
            _, try_gl = fx_spend_posting._validate_try_asset_money_account(
                session, entity_id, payload.try_money_account_id
            )
            try_cost_kurus = compute_spend_at_average_cost(
                session, entity_id, fx_account_id, native_quantity
            )
            fx_gain = fx_spend_posting._chart_account(session, FX_GAIN_CODE)
            fx_loss = fx_spend_posting._chart_account(session, FX_LOSS_CODE)
            lines = build_fx_conversion_posting_lines(
                try_asset_gl_account_id=try_gl.id,
                fx_gl_account_id=fx_gl.id,
                fx_gain_account_id=fx_gain.id,
                fx_loss_account_id=fx_loss.id,
                try_received_kurus=payload.try_received_kurus,
                try_cost_kurus=try_cost_kurus,
            )
        else:
            if payload.expense_account_id is None:
                raise ValueError("expense_account_id required for FX expense spend correction")
            _, fx_gl = fx_spend_posting._validate_fx_money_account(
                session, entity_id, fx_account_id
            )
            expense = fx_spend_posting._validate_expense_account(
                session, entity_id, payload.expense_account_id
            )
            try_cost_kurus = compute_spend_at_average_cost(
                session, entity_id, fx_account_id, native_quantity
            )
            lines = build_fx_expense_spend_posting_lines(
                expense_account_id=expense.id,
                fx_gl_account_id=fx_gl.id,
                try_cost_kurus=try_cost_kurus,
            )

    signed_native = (
        -native_quantity if fx_row.movement_type == FxMovementType.SPEND else native_quantity
    )
    signed_try_cost = (
        -try_cost_kurus if fx_row.movement_type == FxMovementType.SPEND else try_cost_kurus
    )

    result = correct_fx_conversion_or_spend(
        session,
        entity_id,
        journal_entry_id,
        payload.entry_date,
        payload.description,
        lines,
        actor_id=payload.actor_id,
        native_quantity=signed_native,
        try_cost_kurus=signed_try_cost,
        reason=payload.reason,
        void_date=payload.void_date,
        period_unlock_reason=payload.period_unlock_reason,
    )
    with entity_context(session, entity_id):
        new_row = session.scalar(
            select(FxLedgerEntry).where(
                FxLedgerEntry.journal_entry_id == result.corrected.id
            )
        )
    if new_row is None:
        raise CorrectionNotFoundError("corrected FX ledger entry not found")
    return FxLedgerEntryCorrectOut(
        original_journal_entry_id=result.original.id,
        reversal_journal_entry_id=result.reversal.id,
        corrected_journal_entry_id=result.corrected.id,
        fx_ledger_entry=_to_ledger_read(new_row),
        try_cost_kurus=try_cost_kurus,
    )
