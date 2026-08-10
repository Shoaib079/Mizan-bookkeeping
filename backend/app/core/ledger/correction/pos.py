"""Correcting and voiding a day's point-of-sale summary.

Lifted verbatim from `correction.py` when it was split.

One summary owns several journal entries — a card batch and a cash movement —
so correcting it voids each and reposts from the corrected figures rather than
editing any one of them. `PosDailySummaryCorrectionError` came with it: the
two functions here are its only users.
"""

from __future__ import annotations

from app.core.ledger.correction.machinery import SubledgerVoidResult, _append_cash_movement_reversal, _void_journal_entry_in_transaction
from app.core.ledger.models import JournalEntry
from app.db.session import entity_context, require_entity_context
from app.features.cash.models import CashMovement
from app.features.entities import service as entity_service
from datetime import date
from sqlalchemy.orm import Session
import uuid


class PosDailySummaryCorrectionError(ValueError):
    """Posted POS daily summary cannot be corrected."""


def correct_pos_daily_summary(
    session: Session,
    entity_id: uuid.UUID,
    summary: "PosDailySummary",
    *,
    money_account_id: uuid.UUID,
    cash_kurus: int,
    card_kurus: int,
    summary_date: date,
    actor_id: uuid.UUID,
    description: str,
    z_report_kurus: int | None = None,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> "PosDailySummaryPostResult":
    """Void linked card batch + cash movement JEs and repost corrected daily sales."""
    from app.core.period_locks.guards import assert_entry_dates_allowed, mark_periods_dirty_for_dates
    from app.core.pos.daily_summary_posting import (
        PosDailySummaryPostError,
        PosDailySummaryPostResult,
        confirm_pos_daily_summary,
    )
    from app.features.pos.models import CardSalesBatch, PosDailySummaryStatus

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    status = PosDailySummaryStatus(summary.status)
    if status != PosDailySummaryStatus.POSTED:
        raise PosDailySummaryCorrectionError(
            f"summary status {status.value!r} cannot be corrected — must be posted"
        )

    if cash_kurus < 0 or card_kurus < 0:
        raise PosDailySummaryPostError("cash and card amounts must be >= 0")
    if cash_kurus == 0 and card_kurus == 0:
        raise PosDailySummaryPostError("at least one of cash or card must be positive")

    total_kurus = cash_kurus + card_kurus
    dirty_dates: list[date] = []

    with entity_context(session, entity_id):
        require_entity_context()

        from app.core.ledger.models import journal_void_update_allowed

        with journal_void_update_allowed(session):
            if summary.card_sales_batch_id is not None:
                batch = session.get(CardSalesBatch, summary.card_sales_batch_id)
                if batch is not None:
                    _, card_reversal = _void_journal_entry_in_transaction(
                        session,
                        entity_id,
                        batch.journal_entry_id,
                        actor_id=actor_id,
                        reason=reason,
                        void_date=void_date,
                        period_unlock_reason=period_unlock_reason,
                    )
                    dirty_dates.extend([batch.sales_date, card_reversal.entry_date])

            if summary.cash_movement_id is not None:
                original_cash = session.get(CashMovement, summary.cash_movement_id)
                if original_cash is not None:
                    _, cash_reversal = _void_journal_entry_in_transaction(
                        session,
                        entity_id,
                        original_cash.journal_entry_id,
                        actor_id=actor_id,
                        reason=reason,
                        void_date=void_date,
                        period_unlock_reason=period_unlock_reason,
                    )
                    _append_cash_movement_reversal(
                        session,
                        entity_id,
                        original_cash,
                        cash_reversal,
                        actor_id=actor_id,
                        void_date=void_date,
                        period_unlock_reason=period_unlock_reason,
                    )
                    dirty_dates.extend(
                        [original_cash.movement_date, cash_reversal.entry_date]
                    )

            summary.summary_date = summary_date
            summary.cash_kurus = cash_kurus
            summary.card_kurus = card_kurus
            summary.total_kurus = total_kurus
            summary.money_account_id = money_account_id
            if z_report_kurus is not None:
                summary.z_report_kurus = z_report_kurus
            summary.status = PosDailySummaryStatus.CONFIRMED
            summary.card_sales_batch_id = None
            summary.cash_movement_id = None
            session.flush()

        assert_entry_dates_allowed(
            session,
            entity_id,
            [summary_date],
            actor_id=actor_id,
            unlock_reason=period_unlock_reason,
        )

        result = confirm_pos_daily_summary(
            session,
            entity_id,
            summary,
            money_account_id=money_account_id,
            cash_kurus=cash_kurus,
            card_kurus=card_kurus,
            actor_id=actor_id,
            description=description,
            z_report_kurus=z_report_kurus,
            period_unlock_reason=period_unlock_reason,
        )

        if dirty_dates:
            mark_periods_dirty_for_dates(session, entity_id, dirty_dates)

        return result


def void_pos_daily_summary(
    session: Session,
    entity_id: uuid.UUID,
    summary: "PosDailySummary",
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    """Void a posted daily summary — reverse linked card batch + cash movement JEs.

    Same void half as ``correct_pos_daily_summary`` but without a repost; the
    summary row is marked voided, freeing its date for a fresh posting.
    F3 policy (2026-07-10): identical retroactive behavior to all other voids,
    gated by period locks.
    """
    from app.core.period_locks.guards import mark_periods_dirty_for_dates
    from app.features.pos.models import CardSalesBatch, PosDailySummaryStatus

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    status = PosDailySummaryStatus(summary.status)
    if status != PosDailySummaryStatus.POSTED:
        raise PosDailySummaryCorrectionError(
            f"summary status {status.value!r} cannot be voided — must be posted"
        )

    dirty_dates: list[date] = []
    original: JournalEntry | None = None
    reversal: JournalEntry | None = None

    with entity_context(session, entity_id):
        require_entity_context()

        from app.core.ledger.models import journal_void_update_allowed

        with journal_void_update_allowed(session):
            if summary.card_sales_batch_id is not None:
                batch = session.get(CardSalesBatch, summary.card_sales_batch_id)
                if batch is not None:
                    original, reversal = _void_journal_entry_in_transaction(
                        session,
                        entity_id,
                        batch.journal_entry_id,
                        actor_id=actor_id,
                        reason=reason,
                        void_date=void_date,
                        period_unlock_reason=period_unlock_reason,
                    )
                    dirty_dates.extend([batch.sales_date, reversal.entry_date])

            if summary.cash_movement_id is not None:
                original_cash = session.get(CashMovement, summary.cash_movement_id)
                if original_cash is not None:
                    cash_original, cash_reversal = _void_journal_entry_in_transaction(
                        session,
                        entity_id,
                        original_cash.journal_entry_id,
                        actor_id=actor_id,
                        reason=reason,
                        void_date=void_date,
                        period_unlock_reason=period_unlock_reason,
                    )
                    _append_cash_movement_reversal(
                        session,
                        entity_id,
                        original_cash,
                        cash_reversal,
                        actor_id=actor_id,
                        void_date=void_date,
                    )
                    dirty_dates.extend(
                        [original_cash.movement_date, cash_reversal.entry_date]
                    )
                    if original is None:
                        original, reversal = cash_original, cash_reversal

            if original is None or reversal is None:
                raise PosDailySummaryCorrectionError(
                    "summary has no linked journal entries to void"
                )

            summary.status = PosDailySummaryStatus.VOIDED
            # Retire the fingerprint so the same POS photo can be re-uploaded
            # after the void — the (entity_id, file_fingerprint) unique
            # constraint would otherwise block it forever.
            summary.file_fingerprint = f"voided:{summary.id}"
            if dirty_dates:
                mark_periods_dirty_for_dates(session, entity_id, dirty_dates)
            session.flush()
        session.commit()
        session.refresh(original)
        session.refresh(reversal)
        return SubledgerVoidResult(original=original, reversal=reversal)
