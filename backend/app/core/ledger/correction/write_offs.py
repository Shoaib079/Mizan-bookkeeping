"""Writing off a receivable, and taking the write-off back.

Lifted verbatim from `correction.py` when it was split, and kept apart from
the rest of the customer flows because deciding a debt will not be paid is a
different act from recording a sale or a payment — and because together they
came to 421 lines, over the file-size limit the split exists to respect.

A write-off and a group-sale discount are both DISCOUNT rows under source
GROUP_SALE. Telling them apart is what `entry_capabilities` does, and getting
it wrong sent a discount's Void at the whole sale.
"""

from __future__ import annotations

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.correction.machinery import SubledgerCorrectionResult, SubledgerVoidResult, _append_customer_reversal, _get_customer_ledger_row, _run_subledger_correction_with_setup, void_gl_with_subledger_rows
from app.core.ledger.correction.registry import CorrectionNotFoundError
from app.core.ledger.models import JournalEntry
from app.core.ledger.posting import InvalidAccountError, PostingLine
from app.core.receivables import ledger as receivables_ledger
from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables.types import CustomerMovementType
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from datetime import date
from sqlalchemy import func, select
from sqlalchemy.orm import Session
import uuid


def correct_customer_write_off(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    write_off_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerCorrectionResult:
    """Change a write-off's amount, date or wording.

    Void and re-post in one transaction, like every other correction here —
    the ledger row is immutable, so "editing" a write-off means replacing it.

    The forex leg is recomputed rather than copied. It is worked out *after*
    the reversal is appended, so the balance it apportions against is the one
    that existed before the original write-off: correcting 88,00 ₺ to 44,00 ₺
    should release half the currency, not half of what is left afterwards.
    """
    from app.core.chart_of_accounts.default_chart import (
        ACCOUNTS_RECEIVABLE_CODE,
        SALES_DISCOUNT_CODE,
    )
    from app.core.receivables.posting import _customer_outstanding_forex

    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_customer_ledger_row(session, journal_entry_id)
        if original_row.movement_type != CustomerMovementType.DISCOUNT:
            raise CorrectionNotFoundError("journal entry is not a receivable write-off")

    def after_gl(
        sess: Session,
        _original: JournalEntry,
        reversal: JournalEntry,
        corrected: JournalEntry,
    ) -> None:
        row = _get_customer_ledger_row(sess, journal_entry_id)
        customer_id = row.customer_id

        # Reversal first: it puts the original write-off back on the balance,
        # which is what the new amount has to be measured against.
        _append_customer_reversal(
            sess, row, reversal, actor_id=actor_id, void_date=void_date
        )

        current = int(
            sess.scalar(
                select(func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0)).where(
                    CustomerLedgerEntry.customer_id == customer_id
                )
            )
            or 0
        )
        if amount_kurus > current:
            raise receivables_ledger.OverpaymentError(
                f"write-off {amount_kurus} exceeds receivable balance {current}"
            )

        currency, native_bal = _customer_outstanding_forex(sess, customer_id)
        native_written: int | None = None
        if currency and native_bal > 0 and current > 0:
            native_written = round(native_bal * amount_kurus / current)

        receivables_ledger.persist_customer_ledger_entry(
            sess,
            customer_id,
            movement_date=write_off_date,
            movement_type=CustomerMovementType.DISCOUNT,
            amount_kurus=-amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=corrected.id,
            forex_currency=currency,
            # Negative, so it reduces what is owed rather than adding to it.
            total_forex_minor=(-native_written if native_written else None),
        )

    def build_lines(sess: Session) -> list[PostingLine]:
        ar_account = sess.scalar(
            select(Account).where(Account.code == ACCOUNTS_RECEIVABLE_CODE)
        )
        discount_account = sess.scalar(
            select(Account).where(Account.code == SALES_DISCOUNT_CODE)
        )
        if ar_account is None or discount_account is None:
            raise InvalidAccountError("write-off accounts not found")
        return [
            PostingLine(
                account_id=discount_account.id,
                amount_kurus=amount_kurus,
                side=AccountNormalBalance.DEBIT,
            ),
            PostingLine(
                account_id=ar_account.id,
                amount_kurus=amount_kurus,
                side=AccountNormalBalance.CREDIT,
            ),
        ]

    return _run_subledger_correction_with_setup(
        session,
        entity_id,
        journal_entry_id,
        write_off_date,
        description,
        build_lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        after_gl=after_gl,
    )


def void_customer_write_off(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    """Undo a receivable write-off.

    Every other row on a customer ledger could be voided; this one could not,
    so a write-off entered by mistake was permanent. It is also the only way
    to repair a write-off posted before `native_balance_for_currency` was
    fixed: those recorded no forex amount, because the balance they consulted
    came back negative and the native leg was skipped. The row itself is
    immutable — correctly — so the remedy is to void and re-post, which now
    writes the native leg it should have written the first time.
    """
    with entity_context(session, entity_id):
        require_entity_context()
        original_row = _get_customer_ledger_row(session, journal_entry_id)
        if original_row.movement_type != CustomerMovementType.DISCOUNT:
            raise CorrectionNotFoundError("journal entry is not a receivable write-off")

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
