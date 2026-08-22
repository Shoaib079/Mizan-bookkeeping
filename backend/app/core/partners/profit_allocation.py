"""Partner profit allocation — Dr 3100 / Cr 3200 (settlement) / Cr 3300 (Decisions §17)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_DOWN

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    OWNER_DRAWINGS_CODE,
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
    _retarget_statement_lines,
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
    gross_amount_kurus: int = 0
    net_balance_before_kurus: int = 0
    offset_kurus: int = 0


@dataclass(frozen=True, slots=True)
class ProfitAllocationPreview:
    total_profit_kurus: int
    splits: tuple[ProfitAllocationSplit, ...]
    netting_as_of: date | None = None


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
    *,
    net_balances: dict[uuid.UUID, int] | None = None,
    net_against_drawings: bool = False,
) -> list[ProfitAllocationSplit]:
    """Floor each share; last partner (by stable sort) absorbs rounding remainder.

    When ``net_against_drawings`` is set, partners with a negative scoped net
    balance (money already taken on or before ``netting_as_of``) receive a
    profit settlement for the offset and a reduced capital allocation.
    """
    if total_kurus <= 0:
        raise ValueError("profit amount must be positive kuruş")

    allocated = 0
    splits: list[ProfitAllocationSplit] = []
    for index, partner in enumerate(partners):
        pct = partner.ownership_share_pct
        assert pct is not None
        if index == len(partners) - 1:
            gross = total_kurus - allocated
        else:
            gross = int(
                (Decimal(total_kurus) * pct / HUNDRED).quantize(
                    Decimal("1"), rounding=ROUND_DOWN
                )
            )
            allocated += gross

        net_before = (net_balances or {}).get(partner.id, 0)
        effective = gross
        offset = 0
        if net_against_drawings and net_before < 0:
            effective = max(0, gross + net_before)
            offset = gross - effective

        splits.append(
            ProfitAllocationSplit(
                partner_id=partner.id,
                partner_name=partner.name,
                ownership_share_pct=pct,
                amount_kurus=effective,
                gross_amount_kurus=gross,
                net_balance_before_kurus=net_before,
                offset_kurus=offset,
            )
        )

    assert sum(s.gross_amount_kurus for s in splits) == total_kurus
    return splits


def preview_profit_allocation(
    session: Session,
    entity_id: uuid.UUID,
    *,
    profit_kurus: int,
    net_against_drawings: bool = True,
    netting_as_of: date,
) -> ProfitAllocationPreview:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        partners = _active_partners_with_shares(session)
        net_balances = {
            p.id: partner_ledger.net_balance_kurus_as_of(
                session, entity_id, p.id, as_of=netting_as_of
            )
            for p in partners
        }
        splits = split_profit_by_ownership(
            profit_kurus,
            partners,
            net_balances=net_balances,
            net_against_drawings=net_against_drawings,
        )
        return ProfitAllocationPreview(
            total_profit_kurus=profit_kurus,
            splits=tuple(splits),
            netting_as_of=netting_as_of,
        )


def build_profit_allocation_lines(
    *,
    retained_earnings_id: uuid.UUID,
    owner_drawings_id: uuid.UUID,
    partner_capital_id: uuid.UUID,
    splits: list[ProfitAllocationSplit],
) -> list[PostingLine]:
    gross_total = sum(s.gross_amount_kurus for s in splits)
    offset_total = sum(s.offset_kurus for s in splits)
    capital_total = sum(s.amount_kurus for s in splits)
    assert gross_total == offset_total + capital_total

    lines: list[PostingLine] = [
        PostingLine(
            account_id=retained_earnings_id,
            amount_kurus=gross_total,
            side=AccountNormalBalance.DEBIT,
        ),
    ]
    if offset_total > 0:
        lines.append(
            PostingLine(
                account_id=owner_drawings_id,
                amount_kurus=offset_total,
                side=AccountNormalBalance.CREDIT,
            )
        )
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
    net_against_drawings: bool = True,
    netting_as_of: date,
    period_unlock_reason: str | None = None,
) -> ProfitAllocationPostResult:
    """Allocate net profit to partners — one JE, settlement + capital subledger rows."""
    if profit_kurus <= 0:
        raise ValueError("profit_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        partners = _active_partners_with_shares(session)
        net_balances = {
            p.id: partner_ledger.net_balance_kurus_as_of(
                session, entity_id, p.id, as_of=netting_as_of
            )
            for p in partners
        }
        splits = split_profit_by_ownership(
            profit_kurus,
            partners,
            net_balances=net_balances,
            net_against_drawings=net_against_drawings,
        )

        retained = _chart_account(session, RETAINED_EARNINGS_CODE)
        drawings = _chart_account(session, OWNER_DRAWINGS_CODE)
        capital = _chart_account(session, PARTNER_CAPITAL_CODE)
        lines = build_profit_allocation_lines(
            retained_earnings_id=retained.id,
            owner_drawings_id=drawings.id,
            partner_capital_id=capital.id,
            splits=splits,
        )
        from app.core.partners.profit_allocation_rows import (
            journal_and_partner_descriptions,
            persist_allocation_partner_rows,
        )

        journal_description, note = journal_and_partner_descriptions(description)
        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            allocation_date,
            journal_description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.PARTNER_PROFIT_ALLOCATION,
            period_unlock_reason=period_unlock_reason,
        )

        partners_by_id = {p.id: p for p in partners}
        partner_entries = persist_allocation_partner_rows(
            session,
            allocation_date=allocation_date,
            splits=splits,
            partners_by_id=partners_by_id,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
            note=note,
        )

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
            # A profit allocation moves no cash, so no bank line can be
            # pointing at it and this finds nothing. Called anyway: the rule
            # is "every void retargets", and a rule with one documented
            # exception is a rule with somewhere for the next gap to hide.
            # The guard test that enforces it needs no allowlist as a result.
            _retarget_statement_lines(session, original.id)
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


def correct_profit_allocation(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    allocation_date: date,
    profit_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    net_against_drawings: bool = True,
    netting_as_of: date,
    reason: str | None = None,
    period_unlock_reason: str | None = None,
) -> ProfitAllocationPostResult:
    """Edit profit allocation — void the original and repost under current rules.

    Partner capital / settlement / unpaid balances update to the new amounts
    because the void reverses every linked subledger row before the repost.
    """
    original = None
    with entity_context(session, entity_id):
        require_entity_context()
        original = _get_voidable_entry(session, journal_entry_id)
        if original.source != JournalEntrySource.PARTNER_PROFIT_ALLOCATION:
            raise CorrectionNotFoundError("journal entry is not a partner profit allocation")
        original_date = original.entry_date

    void_profit_allocation(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason or "Corrected partner profit allocation",
        void_date=original_date,
        period_unlock_reason=period_unlock_reason,
    )
    return post_profit_allocation(
        session,
        entity_id,
        allocation_date=allocation_date,
        profit_kurus=profit_kurus,
        description=description,
        actor_id=actor_id,
        net_against_drawings=net_against_drawings,
        netting_as_of=netting_as_of,
        period_unlock_reason=period_unlock_reason,
    )