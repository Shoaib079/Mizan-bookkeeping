"""POS service — card sales batches, settlements, reconciliation (Decisions §13)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import CARD_SALES_CLEARING_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.pos.posting import (
    InTransitCardSalesError,
    post_card_commission_clearance,
    post_card_sales_batch,
    post_pos_settlement,
)
from app.core.listing import (
    ListParams,
    amount_range_filters,
    date_range_filters,
    fetch_paginated,
    text_search_filter,
)
from app.db.session import entity_context, require_entity_context
from app.features.banking import service as banking_service
from app.features.entities import service as entity_service
from app.features.pos.models import CardSalesBatch, PosSettlement
from app.features.pos.schema import (
    CardCommissionClearanceRead,
    CardCommissionClearanceRequest,
    CardSalesBatchCreate,
    CardSalesBatchRead,
    ClearingAgingBucket,
    ClearingReconciliationRead,
    PosSettlementCreate,
    PosSettlementRead,
)


def _settlement_status(session: Session, settlement: PosSettlement) -> str:
    from app.core.ledger.models import JournalEntry, JournalEntryStatus

    entry = session.get(JournalEntry, settlement.journal_entry_id)
    if entry is not None and entry.status == JournalEntryStatus.VOIDED:
        return "voided"
    return "posted"


def _to_settlement_read(session: Session, settlement: PosSettlement) -> PosSettlementRead:
    return PosSettlementRead(
        status=_settlement_status(session, settlement),
        id=settlement.id,
        entity_id=settlement.entity_id,
        money_account_id=settlement.money_account_id,
        settlement_date=settlement.settlement_date,
        amount_kurus=settlement.amount_kurus,
        description=settlement.description,
        actor_id=settlement.actor_id,
        journal_entry_id=settlement.journal_entry_id,
        reference_type=settlement.reference_type,
        reference_id=settlement.reference_id,
        bank_statement_line_id=settlement.bank_statement_line_id,
        commission_kurus=settlement.commission_kurus,
        commission_inferred=settlement.commission_inferred,
        card_sales_batch_id=settlement.card_sales_batch_id,
        created_at=settlement.created_at,
    )


def _batch_status(session: Session, batch: CardSalesBatch) -> str:
    from app.core.ledger.models import JournalEntry, JournalEntryStatus

    entry = session.get(JournalEntry, batch.journal_entry_id)
    if entry is not None and entry.status == JournalEntryStatus.VOIDED:
        return "voided"
    return "posted"


def _to_batch_read(batch: CardSalesBatch, *, status: str = "posted") -> CardSalesBatchRead:
    return CardSalesBatchRead(
        status=status,
        id=batch.id,
        entity_id=batch.entity_id,
        sales_date=batch.sales_date,
        gross_amount_kurus=batch.gross_amount_kurus,
        description=batch.description,
        actor_id=batch.actor_id,
        journal_entry_id=batch.journal_entry_id,
        created_at=batch.created_at,
    )


def create_card_sales_batch(
    session: Session,
    entity_id: uuid.UUID,
    payload: CardSalesBatchCreate,
) -> CardSalesBatchRead:
    result = post_card_sales_batch(
        session,
        entity_id,
        sales_date=payload.sales_date,
        gross_amount_kurus=payload.gross_amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
    )
    return _to_batch_read(result.card_sales_batch)


def list_card_sales_batches(
    session: Session,
    entity_id: uuid.UUID,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    min_amount: int | None = None,
    max_amount: int | None = None,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[CardSalesBatchRead], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        filters.extend(
            date_range_filters(
                CardSalesBatch.sales_date, from_date=from_date, to_date=to_date
            )
        )
        filters.extend(
            amount_range_filters(
                CardSalesBatch.gross_amount_kurus,
                min_amount=min_amount,
                max_amount=max_amount,
            )
        )
        search = text_search_filter(q, CardSalesBatch.description)
        if search is not None:
            filters.append(search)
        stmt = (
            select(CardSalesBatch)
            .where(*filters)
            .order_by(
                CardSalesBatch.sales_date.desc(),
                CardSalesBatch.created_at.desc(),
            )
        )
        batches, total = fetch_paginated(session, stmt, params)
        return [
            _to_batch_read(batch, status=_batch_status(session, batch))
            for batch in batches
        ], total


def create_pos_settlement(
    session: Session,
    entity_id: uuid.UUID,
    payload: PosSettlementCreate,
) -> PosSettlementRead:
    result = post_pos_settlement(
        session,
        entity_id,
        money_account_id=payload.money_account_id,
        settlement_date=payload.settlement_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        commission_kurus=payload.commission_kurus,
        card_sales_batch_id=payload.card_sales_batch_id,
    )
    return _to_settlement_read(session, result.pos_settlement)


class SuspiciousClearanceAmountError(ValueError):
    """Sweep residual is implausibly large to be commission — needs confirmation."""


# Commission on card sales realistically tops out around a few percent; a residual
# above this share of card sales is almost always undeposited sales, not commission.
_COMMISSION_PLAUSIBILITY_RATE = 0.10


def clear_card_commission(
    session: Session,
    entity_id: uuid.UUID,
    payload: CardCommissionClearanceRequest,
) -> CardCommissionClearanceRead:
    """Total clearance — sweep the current card-clearing residual to commission."""
    reconciliation = get_clearing_reconciliation(session, entity_id)
    if reconciliation.in_transit_kurus > 0 and reconciliation.pos_settlement_count == 0:
        raise InTransitCardSalesError(
            "Card sales are still in transit "
            f"({reconciliation.in_transit_kurus} kuruş unsettled) — "
            "record bank deposits before clearing commission"
        )

    residual_kurus = reconciliation.clearing_balance_kurus
    total_sales_kurus = reconciliation.total_card_sales_kurus
    threshold_kurus = int(total_sales_kurus * _COMMISSION_PLAUSIBILITY_RATE)
    if (
        not payload.confirm
        and total_sales_kurus > 0
        and residual_kurus > threshold_kurus
    ):
        raise SuspiciousClearanceAmountError(
            f"This would book {residual_kurus} kuruş as commission — more than "
            f"{int(_COMMISSION_PLAUSIBILITY_RATE * 100)}% of total card sales "
            f"({total_sales_kurus} kuruş). That usually means card deposits are "
            "missing, not commission. Classify the missing deposits first, or "
            "confirm to proceed anyway."
        )

    result = post_card_commission_clearance(
        session,
        entity_id,
        clearance_date=payload.clearance_date or date.today(),
        description=payload.description or "Bank commission clearance",
        actor_id=payload.actor_id,
    )
    return CardCommissionClearanceRead(
        commission_kurus=result.commission_kurus,
        clearing_balance_before_kurus=result.clearing_balance_before_kurus,
        clearing_balance_after_kurus=0,
        clearance_date=result.journal_entry.entry_date,
        journal_entry_id=result.journal_entry.id,
    )


def list_pos_settlements(
    session: Session,
    entity_id: uuid.UUID,
    *,
    money_account_id: uuid.UUID | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    min_amount: int | None = None,
    max_amount: int | None = None,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[PosSettlementRead], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if money_account_id is not None:
            filters.append(PosSettlement.money_account_id == money_account_id)
        filters.extend(
            date_range_filters(
                PosSettlement.settlement_date, from_date=from_date, to_date=to_date
            )
        )
        filters.extend(
            amount_range_filters(
                PosSettlement.amount_kurus,
                min_amount=min_amount,
                max_amount=max_amount,
            )
        )
        search = text_search_filter(q, PosSettlement.description)
        if search is not None:
            filters.append(search)
        stmt = (
            select(PosSettlement)
            .where(*filters)
            .order_by(
                PosSettlement.settlement_date.desc(),
                PosSettlement.created_at.desc(),
            )
        )
        settlements, total = fetch_paginated(session, stmt, params)
        return [_to_settlement_read(session, s) for s in settlements], total


def get_pos_settlement(
    session: Session,
    entity_id: uuid.UUID,
    settlement_id: uuid.UUID,
) -> PosSettlementRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        settlement = session.get(PosSettlement, settlement_id)
        if settlement is None:
            raise LookupError("POS settlement not found")
        return _to_settlement_read(session, settlement)


def get_clearing_reconciliation(
    session: Session,
    entity_id: uuid.UUID,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
) -> ClearingReconciliationRead:
    from datetime import timedelta

    from app.core.chart_of_accounts.default_chart import CARD_COMMISSION_CODE
    from app.core.ledger.balances import (
        balance_as_of_kurus,
        debit_credit_activity_kurus,
        period_activity_kurus,
    )
    from app.core.pos.aging import AGING_BUCKETS, compute_undeposited_aging

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    from app.core.ledger.models import JournalEntry, JournalEntryStatus

    with entity_context(session, entity_id):
        require_entity_context()

        clearing_account = session.scalar(
            select(Account).where(Account.code == CARD_SALES_CLEARING_CODE)
        )
        if clearing_account is None:
            raise LookupError("Card sales clearing account not found")

        clearing_balance_kurus = banking_service.gl_balance_kurus(
            session,
            clearing_account.id,
            AccountNormalBalance.DEBIT,
        )

        # Totals below must mirror the GL clearing balance, which only counts
        # posted journal lines — so exclude batches/settlements whose journal
        # entry has been voided (e.g. duplicates removed during cleanup).
        total_card_sales_kurus = int(
            session.scalar(
                select(func.coalesce(func.sum(CardSalesBatch.gross_amount_kurus), 0))
                .join(
                    JournalEntry,
                    JournalEntry.id == CardSalesBatch.journal_entry_id,
                )
                .where(JournalEntry.status != JournalEntryStatus.VOIDED)
            )
            or 0
        )
        batch_count = int(
            session.scalar(
                select(func.count())
                .select_from(CardSalesBatch)
                .join(
                    JournalEntry,
                    JournalEntry.id == CardSalesBatch.journal_entry_id,
                )
                .where(JournalEntry.status != JournalEntryStatus.VOIDED)
            )
            or 0
        )

        total_settled_gross_kurus = int(
            session.scalar(
                select(
                    func.coalesce(
                        func.sum(
                            PosSettlement.amount_kurus
                            + func.coalesce(PosSettlement.commission_kurus, 0)
                        ),
                        0,
                    )
                )
                .join(
                    JournalEntry,
                    JournalEntry.id == PosSettlement.journal_entry_id,
                )
                .where(JournalEntry.status != JournalEntryStatus.VOIDED)
            )
            or 0
        )
        settlement_count = int(
            session.scalar(
                select(func.count())
                .select_from(PosSettlement)
                .join(
                    JournalEntry,
                    JournalEntry.id == PosSettlement.journal_entry_id,
                )
                .where(JournalEntry.status != JournalEntryStatus.VOIDED)
            )
            or 0
        )

        in_transit_kurus = total_card_sales_kurus - total_settled_gross_kurus

        # Period roll-forward over the selected range (defaults to current month).
        today = date.today()
        if from_date is None:
            from_date = today.replace(day=1)
        if to_date is None:
            to_date = today

        opening_in_transit_kurus = balance_as_of_kurus(
            session, clearing_account, from_date - timedelta(days=1)
        )
        period_debits, period_credits = debit_credit_activity_kurus(
            session, clearing_account.id, from_date, to_date
        )
        closing_in_transit_kurus = balance_as_of_kurus(
            session, clearing_account, to_date
        )

        # Commission already recognised in 5310 (statement lines + sweeps) in range.
        commission_recorded_kurus = 0
        commission_account = session.scalar(
            select(Account).where(Account.code == CARD_COMMISSION_CODE)
        )
        if commission_account is not None:
            commission_recorded_kurus = period_activity_kurus(
                session, commission_account, from_date, to_date
            )

        # Aging of the current (cumulative) undeposited clearing balance.
        aging_batches = session.execute(
            select(CardSalesBatch.sales_date, CardSalesBatch.gross_amount_kurus)
            .join(
                JournalEntry,
                JournalEntry.id == CardSalesBatch.journal_entry_id,
            )
            .where(JournalEntry.status != JournalEntryStatus.VOIDED)
            .order_by(CardSalesBatch.sales_date.desc())
        ).all()
        aging_map = compute_undeposited_aging(
            [(row[0], int(row[1])) for row in aging_batches],
            clearing_balance_kurus,
            today,
        )

        return ClearingReconciliationRead(
            clearing_balance_kurus=clearing_balance_kurus,
            total_card_sales_kurus=total_card_sales_kurus,
            total_settled_gross_kurus=total_settled_gross_kurus,
            in_transit_kurus=in_transit_kurus,
            card_sales_batch_count=batch_count,
            pos_settlement_count=settlement_count,
            period_from=from_date,
            period_to=to_date,
            opening_in_transit_kurus=opening_in_transit_kurus,
            period_card_sales_kurus=period_debits,
            period_clearances_kurus=period_credits,
            closing_in_transit_kurus=closing_in_transit_kurus,
            commission_recorded_kurus=commission_recorded_kurus,
            aging=[
                ClearingAgingBucket(label=label, amount_kurus=aging_map[label])
                for label, _ in AGING_BUCKETS
            ],
        )


class PosSettlementNotVoidableError(ValueError):
    """POS settlement cannot be voided in its current state."""


def void_pos_settlement_by_id(
    session: Session,
    entity_id: uuid.UUID,
    settlement_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
):
    """Void a POS settlement — reverses bank←clearing, card sales go back in transit."""
    from app.core.ledger.correction import void_gl_with_subledger_rows
    from app.features.ledger.schema import SubledgerVoidOut

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        settlement = session.get(PosSettlement, settlement_id)
        if settlement is None:
            raise LookupError("POS settlement not found")
        if _settlement_status(session, settlement) == "voided":
            raise PosSettlementNotVoidableError("POS settlement is already voided")
        journal_entry_id = settlement.journal_entry_id

    result = void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )
    return SubledgerVoidOut(
        original_journal_entry_id=result.original.id,
        reversal_journal_entry_id=result.reversal.id,
    )


class CardSalesBatchNotVoidableError(ValueError):
    """Raised when a card sales batch cannot be voided directly."""


def void_card_sales_batch_by_id(
    session: Session,
    entity_id: uuid.UUID,
    batch_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
):
    """Void a card sales batch — reverses Dr 1400 clearing / Cr revenue for the day.

    Used to remove duplicate/mistaken batches (e.g. a manual daily-sales entry
    that double-counts a day already covered by another batch).

    Guards:
    - Already-voided batch: nothing to do.
    - Batch owned by a POS daily summary: void it from the daily-summary flow so
      the summary record stays consistent.
    - Batch already settled by a live POS settlement: void that settlement first,
      otherwise the clearing account would go negative against a reversed batch.
    """
    from app.core.ledger.models import JournalEntry, JournalEntryStatus
    from app.core.ledger.posting import void_journal_entry
    from app.features.ledger.schema import SubledgerVoidOut
    from app.features.pos.models import PosDailySummary

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        batch = session.get(CardSalesBatch, batch_id)
        if batch is None:
            raise LookupError("Card sales batch not found")
        journal_entry_id = batch.journal_entry_id

        entry = session.get(JournalEntry, journal_entry_id)
        if entry is not None and entry.status == JournalEntryStatus.VOIDED:
            raise CardSalesBatchNotVoidableError("Card sales batch is already voided")

        summary = session.scalars(
            select(PosDailySummary).where(
                PosDailySummary.card_sales_batch_id == batch_id
            )
        ).first()
        if summary is not None:
            raise CardSalesBatchNotVoidableError(
                "This batch came from a POS daily summary — void it from the "
                "daily summaries flow instead."
            )

        settlement = session.scalars(
            select(PosSettlement).where(
                PosSettlement.card_sales_batch_id == batch_id
            )
        ).first()
        if settlement is not None:
            settlement_entry = session.get(JournalEntry, settlement.journal_entry_id)
            if (
                settlement_entry is not None
                and settlement_entry.status != JournalEntryStatus.VOIDED
            ):
                raise CardSalesBatchNotVoidableError(
                    "This day's card sales were already settled to the bank — "
                    "void that POS settlement first, then void the batch."
                )

    original, reversal = void_journal_entry(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )
    return SubledgerVoidOut(
        original_journal_entry_id=original.id,
        reversal_journal_entry_id=reversal.id,
    )
