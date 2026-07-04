"""Partner profit allocation — Dr 3100 / Cr 3300 per ownership share (Decisions §17)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_DOWN

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    PARTNER_CAPITAL_CODE,
    RETAINED_EARNINGS_CODE,
)
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.correction import CorrectionNotFoundError, _append_partner_reversal
from app.core.ledger.models import JournalEntry, JournalEntrySource, journal_void_update_allowed
from app.core.ledger.posting import (
    InvalidAccountError,
    PostingLine,
    _create_reversal_entry,
    _get_voidable_entry,
    _mark_original_voided,
    prepare_journal_entry,
)
from app.core.partners import ledger as partner_ledger
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.partners.models import Partner

HUNDRED = Decimal("100")


class OwnershipShareError(ValueError):
    """Active partner ownership shares must sum to exactly 100%."""


@dataclass(frozen=True, slots=True)
class ProfitAllocationSplit:
    partner_id: uuid.UUID
    partner_name: str
    ownership_share_pct: Decimal
    amount_kurus: int


@dataclass(frozen=True, slots=True)
class ProfitAllocationPreview:
    total_profit_kurus: int
    splits: tuple[ProfitAllocationSplit, ...]


@dataclass(frozen=True, slots=True)
class ProfitAllocationPostResult:
    journal_entry: JournalEntry
    partner_ledger_entries: tuple[PartnerLedgerEntry, ...]


def _chart_account(session: Session, code: str):
    from app.core.chart_of_accounts.models import Account

    account = session.scalar(select(Account).where(Account.code == code))
    if account is None:
        raise InvalidAccountError(f"chart account {code} not found")
    if not account.is_active:
        raise InvalidAccountError(f"account {code} is not active")
    return account


def _active_partners_with_shares(session: Session) -> list[Partner]:
    partners = list(
        session.scalars(
            select(Partner)
            .where(Partner.is_active.is_(True))
            .order_by(Partner.name, Partner.id)
        )
    )
    if not partners:
        raise OwnershipShareError("No active partners found")
    missing = [p.name for p in partners if p.ownership_share_pct is None]
    if missing:
        raise OwnershipShareError(
            f"Every active partner needs an ownership share % — missing for: {', '.join(missing)}"
        )
    total = sum((p.ownership_share_pct for p in partners), start=Decimal("0"))
    if total != HUNDRED:
        raise OwnershipShareError(
            f"Ownership shares total {total}% — must equal exactly 100% before allocating profit"
        )
    return partners


def split_profit_by_ownership(
    total_kurus: int,
    partners: list[Partner],
) -> list[ProfitAllocationSplit]:
    """Floor each share; last partner (by stable sort) absorbs rounding remainder."""
    if total_kurus <= 0:
        raise ValueError("profit amount must be positive kuruş")

    allocated = 0
    splits: list[ProfitAllocationSplit] = []
    for index, partner in enumerate(partners):
        pct = partner.ownership_share_pct
        assert pct is not None
        if index == len(partners) - 1:
            amount = total_kurus - allocated
        else:
            amount = int(
                (Decimal(total_kurus) * pct / HUNDRED).quantize(
                    Decimal("1"), rounding=ROUND_DOWN
                )
            )
            allocated += amount
        splits.append(
            ProfitAllocationSplit(
                partner_id=partner.id,
                partner_name=partner.name,
                ownership_share_pct=pct,
                amount_kurus=amount,
            )
        )

    assert sum(s.amount_kurus for s in splits) == total_kurus
    return splits


def preview_profit_allocation(
    session: Session,
    entity_id: uuid.UUID,
    *,
    profit_kurus: int,
) -> ProfitAllocationPreview:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        partners = _active_partners_with_shares(session)
        splits = split_profit_by_ownership(profit_kurus, partners)
        return ProfitAllocationPreview(
            total_profit_kurus=profit_kurus,
            splits=tuple(splits),
        )


def build_profit_allocation_lines(
    *,
    retained_earnings_id: uuid.UUID,
    partner_capital_id: uuid.UUID,
    splits: list[ProfitAllocationSplit],
) -> list[PostingLine]:
    total = sum(s.amount_kurus for s in splits)
    lines: list[PostingLine] = [
        PostingLine(
            account_id=retained_earnings_id,
            amount_kurus=total,
            side=AccountNormalBalance.DEBIT,
        ),
    ]
    for split in splits:
        if split.amount_kurus <= 0:
            continue
        lines.append(
            PostingLine(
                account_id=partner_capital_id,
                amount_kurus=split.amount_kurus,
                side=AccountNormalBalance.CREDIT,
            )
        )
    return lines


def post_profit_allocation(
    session: Session,
    entity_id: uuid.UUID,
    *,
    allocation_date: date,
    profit_kurus: int,
    description: str,
    actor_id: uuid.UUID,
) -> ProfitAllocationPostResult:
    """Allocate net profit to partners — one JE, one subledger row per partner."""
    if profit_kurus <= 0:
        raise ValueError("profit_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        partners = _active_partners_with_shares(session)
        splits = split_profit_by_ownership(profit_kurus, partners)

        retained = _chart_account(session, RETAINED_EARNINGS_CODE)
        capital = _chart_account(session, PARTNER_CAPITAL_CODE)
        lines = build_profit_allocation_lines(
            retained_earnings_id=retained.id,
            partner_capital_id=capital.id,
            splits=splits,
        )
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            allocation_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.PARTNER_PROFIT_ALLOCATION,
        )

        partner_entries: list[PartnerLedgerEntry] = []
        for split in splits:
            if split.amount_kurus == 0:
                continue
            entry = partner_ledger.persist_partner_ledger_entry(
                session,
                split.partner_id,
                movement_date=allocation_date,
                movement_type=PartnerMovementType.PROFIT_ALLOCATION,
                amount_kurus=split.amount_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=journal_entry.id,
            )
            partner_entries.append(entry)

        session.commit()
        session.refresh(journal_entry)
        for entry in partner_entries:
            session.refresh(entry)
        _ = list(journal_entry.lines)

        return ProfitAllocationPostResult(
            journal_entry=journal_entry,
            partner_ledger_entries=tuple(partner_entries),
        )


def void_profit_allocation(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> tuple[JournalEntry, JournalEntry]:
    """Void profit allocation — reverse GL and all linked partner subledger rows."""
    from app.core.period_locks.guards import assert_entry_dates_allowed, mark_periods_dirty_for_dates, utc_today

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        original = _get_voidable_entry(session, journal_entry_id)
        if original.source != JournalEntrySource.PARTNER_PROFIT_ALLOCATION:
            raise CorrectionNotFoundError("journal entry is not a partner profit allocation")

        partner_rows = list(
            session.scalars(
                select(PartnerLedgerEntry).where(
                    PartnerLedgerEntry.journal_entry_id == journal_entry_id
                )
            )
        )
        if not partner_rows:
            raise CorrectionNotFoundError("partner ledger entries not found for journal entry")

        effective_void_date = void_date or utc_today()
        assert_entry_dates_allowed(
            session,
            entity_id,
            [original.entry_date, effective_void_date],
            actor_id=actor_id,
            unlock_reason=period_unlock_reason,
        )
        reversal = _create_reversal_entry(
            session,
            entity_id,
            original,
            actor_id=actor_id,
            reason=reason,
            void_date=void_date,
            period_unlock_reason=period_unlock_reason,
        )
        for row in partner_rows:
            _append_partner_reversal(
                session, row, reversal, actor_id=actor_id, void_date=void_date
            )
        with journal_void_update_allowed(session):
            _mark_original_voided(
                session, original, reversal, actor_id=actor_id, reason=reason
            )
            session.commit()
        mark_periods_dirty_for_dates(
            session,
            entity_id,
            [original.entry_date, reversal.entry_date],
        )
        session.commit()
        session.refresh(original)
        session.refresh(reversal)
        return original, reversal
