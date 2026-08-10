"""Correcting and voiding foreign-currency purchases, conversions and spend.

Lifted verbatim from `correction.py` when it was split.

`_get_cash_movement_for_journal` came with them: an FX purchase settles in
cash, so both the correct and void paths need the movement behind the entry.
It sat in the shared machinery, where only these two functions ever called it.
"""

from __future__ import annotations

from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.fx.ledger import record_fx_movement
from app.core.fx.posting import build_fx_purchase_posting_lines, record_fx_purchase_cash_movement
from app.core.fx.types import FxMovementType
from app.core.ledger.correction.machinery import SubledgerCorrectionResult, SubledgerVoidResult, _append_cash_movement_reversal, _append_fx_reversal, _get_fx_ledger_row, _run_subledger_correction_with_setup, correct_gl_with_subledger_rows, void_gl_with_subledger_rows
from app.core.ledger.correction.registry import CorrectionNotFoundError
from app.core.ledger.models import JournalEntry
from app.core.ledger.posting import PostingLine, _get_voidable_entry
from app.db.session import entity_context, require_entity_context
from app.features.cash.models import CashMovement
from app.features.entities import service as entity_service
from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import Session
import uuid


def _get_cash_movement_for_journal(
    session: Session, journal_entry_id: uuid.UUID
) -> CashMovement | None:
    return session.scalar(
        select(CashMovement).where(CashMovement.journal_entry_id == journal_entry_id)
    )


def correct_fx_purchase(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    purchase_date: date,
    native_quantity: int,
    try_cost_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    fx_money_account_id: uuid.UUID | None = None,
    try_cash_money_account_id: uuid.UUID | None = None,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerCorrectionResult:
    from app.features.banking.models import MoneyAccount

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    def after_gl(
        sess: Session,
        _original: JournalEntry,
        reversal: JournalEntry,
        corrected: JournalEntry,
    ) -> None:
        original_row = _get_fx_ledger_row(sess, journal_entry_id)
        if original_row.movement_type != FxMovementType.PURCHASE:
            raise CorrectionNotFoundError("journal entry is not an FX purchase")

        fx_account_id = fx_money_account_id or original_row.fx_money_account_id
        _append_fx_reversal(
            sess, original_row, reversal, actor_id=actor_id, void_date=void_date
        )
        record_fx_movement(
            sess,
            fx_account_id,
            movement_date=purchase_date,
            movement_type=FxMovementType.PURCHASE,
            native_quantity=native_quantity,
            try_cost_kurus=try_cost_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=corrected.id,
        )

        original_cash = _get_cash_movement_for_journal(sess, journal_entry_id)
        if original_cash is not None:
            _append_cash_movement_reversal(
                sess,
                entity_id,
                original_cash,
                reversal,
                actor_id=actor_id,
                void_date=void_date,
                period_unlock_reason=period_unlock_reason,
            )
            try_cash_id = try_cash_money_account_id or original_cash.money_account_id
            try_cash = sess.get(MoneyAccount, try_cash_id)
            if try_cash is None:
                raise LookupError("TRY cash money account not found")
            fx_money = sess.get(MoneyAccount, fx_account_id)
            if fx_money is None:
                raise LookupError("FX money account not found")
            record_fx_purchase_cash_movement(
                sess,
                entity_id,
                try_cash_account=try_cash,
                fx_gl_account_id=fx_money.gl_account_id,
                try_cost_kurus=try_cost_kurus,
                movement_date=purchase_date,
                description=description,
                actor_id=actor_id,
                journal_entry_id=corrected.id,
                period_unlock_reason=period_unlock_reason,
            )

    def build_lines(sess: Session) -> list[PostingLine]:
        original_row = _get_fx_ledger_row(sess, journal_entry_id)
        fx_account_id = fx_money_account_id or original_row.fx_money_account_id
        fx_money = sess.get(MoneyAccount, fx_account_id)
        if fx_money is None:
            raise LookupError("FX money account not found")

        original_je = _get_voidable_entry(sess, journal_entry_id)
        credit_line = next(
            (line for line in original_je.lines if line.side == AccountNormalBalance.CREDIT),
            None,
        )
        if credit_line is None:
            raise CorrectionNotFoundError("FX purchase journal entry missing credit line")

        try_cash_gl_id = credit_line.account_id
        if try_cash_money_account_id is not None:
            try_cash = sess.get(MoneyAccount, try_cash_money_account_id)
            if try_cash is None:
                raise LookupError("TRY cash money account not found")
            try_cash_gl_id = try_cash.gl_account_id

        return build_fx_purchase_posting_lines(
            fx_gl_account_id=fx_money.gl_account_id,
            try_cash_gl_account_id=try_cash_gl_id,
            try_cost_kurus=try_cost_kurus,
        )

    return _run_subledger_correction_with_setup(
        session,
        entity_id,
        journal_entry_id,
        purchase_date,
        description,
        build_lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        after_gl=after_gl,
    )


def correct_fx_conversion_or_spend(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    entry_date: date,
    description: str,
    lines: list[PostingLine],
    *,
    actor_id: uuid.UUID,
    native_quantity: int,
    try_cost_kurus: int,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerCorrectionResult:
    with entity_context(session, entity_id):
        require_entity_context()
        fx_row = _get_fx_ledger_row(session, journal_entry_id)
        fx_account_id = fx_row.fx_money_account_id
        movement_type = fx_row.movement_type

        def new_fx(sess: Session, corrected: JournalEntry) -> None:
            record_fx_movement(
                sess,
                fx_account_id,
                movement_date=entry_date,
                movement_type=movement_type,
                native_quantity=native_quantity,
                try_cost_kurus=try_cost_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=corrected.id,
            )

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        entry_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        fx_row=fx_row,
        new_fx_row=new_fx,
    )


def void_fx_purchase(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_fx_ledger_row(session, journal_entry_id)
        if original_row.movement_type != FxMovementType.PURCHASE:
            raise CorrectionNotFoundError("journal entry is not an FX purchase")

    def after_cash(
        sess: Session,
        _original: JournalEntry,
        reversal: JournalEntry,
    ) -> None:
        original_cash = _get_cash_movement_for_journal(sess, journal_entry_id)
        if original_cash is not None:
            _append_cash_movement_reversal(
                sess,
                entity_id,
                original_cash,
                reversal,
                actor_id=actor_id,
                void_date=void_date,
                period_unlock_reason=period_unlock_reason,
            )

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        fx_row=original_row,
        after_gl=after_cash,
    )


def void_fx_conversion_or_spend(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_fx_ledger_row(session, journal_entry_id)
        if original_row.movement_type not in (
            FxMovementType.CONVERSION,
            FxMovementType.EXPENSE_SPEND,
        ):
            raise CorrectionNotFoundError("journal entry is not FX conversion or spend")

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        fx_row=original_row,
    )
