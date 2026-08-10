"""Correcting and voiding what a customer bought, or paid.

Lifted verbatim from `correction.py` when it was split. Write-offs are next
door in `write_offs.py` — the same subledger, a different decision.
"""

from __future__ import annotations

from app.core.chart_of_accounts.models import Account
from app.core.fx.ledger import record_fx_movement
from app.core.fx.models import FxLedgerEntry
from app.core.fx.types import FxMovementType
from app.core.ledger.correction.machinery import SubledgerCorrectionResult, SubledgerVoidResult, _append_customer_reversal, _append_fx_reversal, _get_customer_ledger_row, _run_subledger_correction_with_setup, correct_gl_with_subledger_rows, void_gl_with_subledger_rows
from app.core.ledger.correction.registry import CorrectionNotFoundError
from app.core.ledger.models import JournalEntry
from app.core.ledger.posting import InvalidAccountError, PostingLine
from app.core.receivables import ledger as receivables_ledger
from app.core.receivables import posting as receivables_posting
from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables.types import CustomerMovementType
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from datetime import date
from sqlalchemy import func, select
from sqlalchemy.orm import Session
import uuid


def correct_customer_payment(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    payment_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    payment_account_id: uuid.UUID,
    payment_native_quantity: int | None = None,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerCorrectionResult:
    from app.features.banking.models import MoneyAccount, MoneyAccountKind

    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    from app.core.chart_of_accounts.default_chart import ACCOUNTS_RECEIVABLE_CODE

    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_customer_ledger_row(session, journal_entry_id)
        if original_row.movement_type != CustomerMovementType.PAYMENT_RECEIVED:
            raise CorrectionNotFoundError("journal entry is not a customer payment")
        customer_id = original_row.customer_id
        old_payment = -original_row.amount_kurus
        current = session.scalar(
            select(func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0)).where(
                CustomerLedgerEntry.customer_id == customer_id
            )
        )
        if int(current or 0) + old_payment - amount_kurus < 0:
            raise receivables_ledger.OverpaymentError(
                f"Payment of {amount_kurus} exceeds receivable balance"
            )

        new_money_account = session.scalar(
            select(MoneyAccount).where(
                MoneyAccount.entity_id == entity_id,
                MoneyAccount.gl_account_id == payment_account_id,
            )
        )
        is_fx_wallet = (
            new_money_account is not None
            and new_money_account.account_kind == MoneyAccountKind.FOREIGN_CURRENCY
        )
        if is_fx_wallet:
            if payment_native_quantity is None or payment_native_quantity <= 0:
                raise ValueError(
                    "FX wallet payment requires a positive payment_native_quantity"
                )
        elif payment_native_quantity is not None:
            raise ValueError(
                "payment_native_quantity is only allowed for FX wallet receipts"
            )

    def after_gl(
        sess: Session,
        _original: JournalEntry,
        reversal: JournalEntry,
        corrected: JournalEntry,
    ) -> None:
        original_row = _get_customer_ledger_row(sess, journal_entry_id)
        customer_id = original_row.customer_id

        money_account = sess.scalar(
            select(MoneyAccount).where(
                MoneyAccount.entity_id == entity_id,
                MoneyAccount.gl_account_id == payment_account_id,
            )
        )
        corrected_is_fx = (
            money_account is not None
            and money_account.account_kind == MoneyAccountKind.FOREIGN_CURRENCY
        )

        _append_customer_reversal(
            sess, original_row, reversal, actor_id=actor_id, void_date=void_date
        )
        receivables_ledger.persist_customer_ledger_entry(
            sess,
            customer_id,
            movement_date=payment_date,
            movement_type=CustomerMovementType.PAYMENT_RECEIVED,
            amount_kurus=-amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=corrected.id,
            reference_type=original_row.reference_type,
            reference_id=original_row.reference_id,
            forex_currency=money_account.currency if corrected_is_fx else None,
            payment_native_quantity=(
                payment_native_quantity if corrected_is_fx else None
            ),
        )

        original_fx = sess.scalar(
            select(FxLedgerEntry).where(
                FxLedgerEntry.journal_entry_id == journal_entry_id
            )
        )
        if original_fx is not None:
            _append_fx_reversal(
                sess, original_fx, reversal, actor_id=actor_id, void_date=void_date
            )
        if corrected_is_fx and money_account is not None:
            record_fx_movement(
                sess,
                money_account.id,
                movement_date=payment_date,
                movement_type=FxMovementType.RECEIPT,
                native_quantity=payment_native_quantity,
                try_cost_kurus=amount_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=corrected.id,
            )

    def build_lines(sess: Session) -> list[PostingLine]:
        ar_account = sess.scalar(
            select(Account).where(Account.code == ACCOUNTS_RECEIVABLE_CODE)
        )
        if ar_account is None:
            raise InvalidAccountError("accounts receivable account not found")
        return receivables_posting.build_customer_payment_lines(
            ar_account_id=ar_account.id,
            payment_account_id=payment_account_id,
            amount_kurus=amount_kurus,
        )

    return _run_subledger_correction_with_setup(
        session,
        entity_id,
        journal_entry_id,
        payment_date,
        description,
        build_lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        after_gl=after_gl,
    )


def correct_credit_sale(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    sale_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    revenue_account_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerCorrectionResult:
    from app.core.chart_of_accounts.default_chart import ACCOUNTS_RECEIVABLE_CODE

    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_customer_ledger_row(session, journal_entry_id)
        if original_row.movement_type != CustomerMovementType.CREDIT_SALE:
            raise CorrectionNotFoundError("journal entry is not a credit sale")

        customer_id = original_row.customer_id
        ar_account = session.scalar(
            select(Account).where(Account.code == ACCOUNTS_RECEIVABLE_CODE)
        )
        if ar_account is None:
            raise InvalidAccountError("accounts receivable account not found")

        lines = receivables_posting.build_credit_sale_lines(
            ar_account_id=ar_account.id,
            revenue_account_id=revenue_account_id,
            amount_kurus=amount_kurus,
        )

        def new_row(sess: Session, corrected: JournalEntry) -> None:
            receivables_ledger.persist_customer_ledger_entry(
                sess,
                customer_id,
                movement_date=sale_date,
                movement_type=CustomerMovementType.CREDIT_SALE,
                amount_kurus=amount_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=corrected.id,
            )

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        sale_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        customer_row=original_row,
        new_customer_row=new_row,
    )


def void_customer_payment(
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
        original_row = _get_customer_ledger_row(session, journal_entry_id)
        if original_row.movement_type != CustomerMovementType.PAYMENT_RECEIVED:
            raise CorrectionNotFoundError("journal entry is not a customer payment")

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        customer_row=original_row,
    )


def void_credit_sale(
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
        original_row = _get_customer_ledger_row(session, journal_entry_id)
        if original_row.movement_type != CustomerMovementType.CREDIT_SALE:
            raise CorrectionNotFoundError("journal entry is not a credit sale")

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        customer_row=original_row,
    )
