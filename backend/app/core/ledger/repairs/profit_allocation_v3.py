"""Bring legacy partner profit allocations to settle-then-net (era C) shape."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import date
from enum import Enum

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth.types import EntityRole
from app.core.chart_of_accounts.default_chart import (
    OWNER_DRAWINGS_CODE,
    PARTNER_CAPITAL_CODE,
    RETAINED_EARNINGS_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntrySource, JournalEntryStatus
from app.core.partners import ledger as partner_ledger
from app.core.partners import profit_allocation as pa
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.core.schema_types import DEV_ACTOR_ID
from app.db.session import entity_context, require_entity_context
from app.features.auth.models import EntityMembership, User
from app.features.partners.models import Partner

logger = logging.getLogger(__name__)

REPAIR_KEY = "profit_allocation_v3"
UNLOCK_REASON = "ledger repair profit_allocation_v3"


class AllocationEra(str, Enum):
    A = "a"  # full Dr 3100 / Cr 3300, no settlement
    B = "b"  # netted-down 3100+capital without Cr 3200 / PROFIT_SETTLEMENT
    C = "c"  # current settle-then-net


@dataclass(frozen=True, slots=True)
class _AllocationSnapshot:
    journal_entry_id: uuid.UUID
    entry_date: date
    description: str
    debit_retained_kurus: int
    capital_by_partner: dict[uuid.UUID, int]
    partner_ids: tuple[uuid.UUID, ...]
    era: AllocationEra


def _account_ids_by_code(session: Session) -> dict[str, uuid.UUID]:
    rows = session.scalars(select(Account)).all()
    return {a.code: a.id for a in rows}


def _resolve_repair_actor(session: Session, entity_id: uuid.UUID) -> uuid.UUID:
    """Prefer an OWNER membership; fall back to DEV_ACTOR when present in users."""
    owner_id = session.scalar(
        select(EntityMembership.user_id)
        .where(
            EntityMembership.entity_id == entity_id,
            EntityMembership.role == EntityRole.OWNER.value,
        )
        .order_by(EntityMembership.created_at, EntityMembership.id)
        .limit(1)
    )
    if owner_id is not None:
        return owner_id
    if session.get(User, DEV_ACTOR_ID) is not None:
        return DEV_ACTOR_ID
    raise RuntimeError(
        f"ledger repair {REPAIR_KEY}: entity {entity_id} has no owner membership "
        "and DEV_ACTOR user is missing"
    )


def classify_allocation_era(
    session: Session,
    entity_id: uuid.UUID,
    entry: JournalEntry,
    *,
    accounts: dict[str, uuid.UUID],
) -> AllocationEra:
    """Detect posting era from JE lines + partner subledger for a non-voided allocation."""
    partner_rows = list(
        session.scalars(
            select(PartnerLedgerEntry).where(
                PartnerLedgerEntry.journal_entry_id == entry.id
            )
        )
    )
    if any(r.movement_type == PartnerMovementType.PROFIT_SETTLEMENT for r in partner_rows):
        return AllocationEra.C

    drawings_id = accounts.get(OWNER_DRAWINGS_CODE)
    if drawings_id is not None:
        for line in entry.lines:
            if (
                line.account_id == drawings_id
                and line.side == AccountNormalBalance.CREDIT
                and line.amount_kurus > 0
            ):
                return AllocationEra.C

    retained_id = accounts[RETAINED_EARNINGS_CODE]
    capital_id = accounts[PARTNER_CAPITAL_CODE]
    debit_retained = sum(
        line.amount_kurus
        for line in entry.lines
        if line.account_id == retained_id and line.side == AccountNormalBalance.DEBIT
    )
    capital_by_partner = {
        r.partner_id: r.amount_kurus
        for r in partner_rows
        if r.movement_type == PartnerMovementType.PROFIT_ALLOCATION and r.amount_kurus > 0
    }
    if debit_retained <= 0 or not capital_by_partner:
        # Unusual shape — treat as needing repair via reconstruction heuristics
        return AllocationEra.B

    partners = list(
        session.scalars(
            select(Partner)
            .where(Partner.id.in_(list(capital_by_partner.keys())))
            .order_by(Partner.name, Partner.id)
        )
    )
    # Active partners with ownership are preferred for ownership match; fall back to JE partners
    try:
        ownership_partners = pa._active_partners_with_shares(session)
    except pa.OwnershipShareError:
        ownership_partners = partners

    if not ownership_partners:
        return AllocationEra.B

    nets = {
        p.id: partner_ledger.net_balance_kurus_as_of(
            session, entity_id, p.id, as_of=entry.entry_date
        )
        for p in ownership_partners
    }
    try:
        splits = pa.split_profit_by_ownership(
            debit_retained,
            ownership_partners,
            net_against_drawings=False,
        )
    except ValueError:
        return AllocationEra.B

    matches_ownership = True
    for split in splits:
        expected = split.amount_kurus
        actual = capital_by_partner.get(split.partner_id, 0)
        if abs(expected - actual) > 1:
            matches_ownership = False
            break

    if matches_ownership:
        # Era A (full capital = ownership of Dr 3100), including when drawings remain.
        return AllocationEra.A
    return AllocationEra.B


def _snapshot_entry(
    session: Session,
    entity_id: uuid.UUID,
    entry: JournalEntry,
    *,
    accounts: dict[str, uuid.UUID],
) -> _AllocationSnapshot | None:
    era = classify_allocation_era(session, entity_id, entry, accounts=accounts)
    if era == AllocationEra.C:
        return None

    retained_id = accounts[RETAINED_EARNINGS_CODE]
    debit_retained = sum(
        line.amount_kurus
        for line in entry.lines
        if line.account_id == retained_id and line.side == AccountNormalBalance.DEBIT
    )
    partner_rows = list(
        session.scalars(
            select(PartnerLedgerEntry).where(
                PartnerLedgerEntry.journal_entry_id == entry.id,
                PartnerLedgerEntry.movement_type == PartnerMovementType.PROFIT_ALLOCATION,
            )
        )
    )
    capital_by_partner = {
        r.partner_id: r.amount_kurus for r in partner_rows if r.amount_kurus > 0
    }
    return _AllocationSnapshot(
        journal_entry_id=entry.id,
        entry_date=entry.entry_date,
        description=entry.description,
        debit_retained_kurus=debit_retained,
        capital_by_partner=capital_by_partner,
        partner_ids=tuple(sorted(capital_by_partner.keys())),
        era=era,
    )


def reconstruct_profit_kurus(
    session: Session,
    entity_id: uuid.UUID,
    snapshot: _AllocationSnapshot,
) -> int:
    """Recover original gross profit after the legacy JE has been voided."""
    if snapshot.era == AllocationEra.A:
        return snapshot.debit_retained_kurus

    # Era B: residual capital E with drawings N still open → G = E + max(0, -N)
    total = 0
    for partner_id, effective in snapshot.capital_by_partner.items():
        net_before = partner_ledger.net_balance_kurus_as_of(
            session, entity_id, partner_id, as_of=snapshot.entry_date
        )
        if net_before >= 0:
            gross = effective
        else:
            gross = effective - net_before  # effective + |net|
        total += gross

    # Partners with E=0 fully absorbed into drawings are already covered when
    # G = -N is assigned only if they had capital lines; if a partner had
    # E=0 and was omitted from capital_by_partner, estimate from nets of
    # active owners that are missing from the snapshot.
    try:
        partners = pa._active_partners_with_shares(session)
    except pa.OwnershipShareError:
        partners = []

    for partner in partners:
        if partner.id in snapshot.capital_by_partner:
            continue
        net_before = partner_ledger.net_balance_kurus_as_of(
            session, entity_id, partner.id, as_of=snapshot.entry_date
        )
        if net_before < 0:
            # Heuristic: treat remaining open drawings as absorbed gross (report later)
            total += -net_before

    if total <= 0:
        # Last resort: use residual debit (may under-allocate vs original)
        return max(snapshot.debit_retained_kurus, 1)
    return total


def _collect_unpaid_flags(
    session: Session,
    entity_id: uuid.UUID,
    partner_ids: tuple[uuid.UUID, ...],
) -> list[dict[str, object]]:
    flags: list[dict[str, object]] = []
    for partner_id in partner_ids:
        unpaid = partner_ledger.unpaid_profit_kurus(session, entity_id, partner_id)
        if unpaid < 0:
            flags.append(
                {
                    "partner_id": str(partner_id),
                    "issue": "negative_unpaid_profit",
                    "unpaid_profit_kurus": unpaid,
                }
            )
    return flags


def apply_profit_allocation_v3(session: Session, entity_id: uuid.UUID) -> dict:
    """Void+repost non-C partner profit allocations oldest-first. Returns report dict."""
    with entity_context(session, entity_id):
        require_entity_context()
        actor_id = _resolve_repair_actor(session, entity_id)
        accounts = _account_ids_by_code(session)
        if RETAINED_EARNINGS_CODE not in accounts or PARTNER_CAPITAL_CODE not in accounts:
            return {
                "repaired": [],
                "skipped_current": 0,
                "errors": ["chart accounts 3100/3300 missing"],
                "warnings": [],
            }

        entries = list(
            session.scalars(
                select(JournalEntry)
                .where(
                    JournalEntry.source == JournalEntrySource.PARTNER_PROFIT_ALLOCATION,
                    JournalEntry.status == JournalEntryStatus.POSTED,
                )
                .order_by(JournalEntry.entry_date, JournalEntry.created_at, JournalEntry.id)
            )
        )

        repaired: list[dict[str, object]] = []
        warnings: list[dict[str, object]] = []
        skipped_current = 0

        for entry in entries:
            # Refresh lines after prior commits
            session.refresh(entry)
            _ = list(entry.lines)
            if entry.status != JournalEntryStatus.POSTED:
                continue

            snapshot = _snapshot_entry(session, entity_id, entry, accounts=accounts)
            if snapshot is None:
                skipped_current += 1
                continue

            old_id = entry.id
            void_profit = pa.void_profit_allocation(
                session,
                entity_id,
                old_id,
                actor_id=actor_id,
                reason=UNLOCK_REASON,
                void_date=snapshot.entry_date,
                period_unlock_reason=UNLOCK_REASON,
            )
            # void commits; re-enter entity context for following work is still open

            with entity_context(session, entity_id):
                require_entity_context()
                profit_kurus = reconstruct_profit_kurus(session, entity_id, snapshot)
                description = snapshot.description or f"Repaired profit allocation ({REPAIR_KEY})"
                result = pa.post_profit_allocation(
                    session,
                    entity_id,
                    allocation_date=snapshot.entry_date,
                    profit_kurus=profit_kurus,
                    description=description,
                    actor_id=actor_id,
                    net_against_drawings=True,
                    netting_as_of=snapshot.entry_date,
                    period_unlock_reason=UNLOCK_REASON,
                )
                new_id = result.journal_entry.id
                flags = _collect_unpaid_flags(session, entity_id, snapshot.partner_ids)

            repaired.append(
                {
                    "voided_journal_entry_id": str(old_id),
                    "new_journal_entry_id": str(new_id),
                    "entry_date": snapshot.entry_date.isoformat(),
                    "era": snapshot.era.value,
                    "profit_kurus": profit_kurus,
                    "reversal_journal_entry_id": str(void_profit[1].id),
                }
            )
            if flags:
                warnings.extend(flags)

        return {
            "repaired": repaired,
            "skipped_current": skipped_current,
            "warnings": warnings,
            "actor_id": str(actor_id),
        }
