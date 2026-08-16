"""Which journal sources may be corrected, and how — the registry alone.

Lifted verbatim from `correction.py` when it was split. This is the *policy*:
three sets naming every journal source as generic-correctable, having its own
correction flow, or void-and-re-enter, plus a check that every source is in
exactly one of them.

It depends on `JournalEntrySource` and nothing else, which is why it moved
first — a module the rest of the package reads and that reads nothing back
cannot take part in a circular import.

The completeness check is the reason this file is worth keeping separate:
"can this be corrected" is a question about the source, and it is answered
here rather than inside two thousand lines of the flows that do the work.
"""

from __future__ import annotations

from app.core.ledger.models import JournalEntrySource


class SubledgerBackedCorrectionError(ValueError):
    """Generic ledger correct rejected — source is not standalone GL."""


class CorrectionNotFoundError(LookupError):
    """No subledger row linked to the journal entry."""


# Standalone GL entries with no paired feature/subledger record.
GENERIC_CORRECTABLE_SOURCES: frozenset[JournalEntrySource] = frozenset(
    {
        JournalEntrySource.MANUAL,
        JournalEntrySource.BANK_FEE,
        # Plain Dr commission / Cr clearing or bank — no feature subledger row.
        JournalEntrySource.POS_COMMISSION_SWEEP,
        JournalEntrySource.POS_COMMISSION_STATEMENT,
    }
)

# Type-specific correction flows (void + repost GL and paired subledger/detail atomically).
DEDICATED_CORRECTION_ROUTES: dict[JournalEntrySource, str] = {
    JournalEntrySource.PAYMENT: "supplier payment correction",
    JournalEntrySource.INVOICE: "supplier invoice correction",
    JournalEntrySource.CUSTOMER_CREDIT_SALE: "customer credit sale correction",
    JournalEntrySource.GROUP_SALE: "group sale correction",
    JournalEntrySource.CUSTOMER_PAYMENT_RECEIVED: "customer payment correction",
    JournalEntrySource.FX_PURCHASE: "FX purchase correction",
    JournalEntrySource.FX_CONVERSION: "FX conversion correction",
    JournalEntrySource.FX_EXPENSE_SPEND: "FX expense spend correction",
    JournalEntrySource.STAFF_ACCRUAL: "staff accrual correction",
    JournalEntrySource.STAFF_ADVANCE: "staff advance correction",
    JournalEntrySource.STAFF_PAYMENT: "staff payment correction",
    JournalEntrySource.PARTNER_EXPENSE_FRONTED: "partner expense correction",
    JournalEntrySource.PARTNER_REIMBURSEMENT_PAID: "partner reimbursement correction",
    JournalEntrySource.PARTNER_DRAWING: "partner drawing correction",
    JournalEntrySource.PARTNER_DRAWING_REPAYMENT: "partner drawing repayment correction",
    JournalEntrySource.PARTNER_PROFIT_PAID: "partner profit payment correction",
    JournalEntrySource.PARTNER_SALARY_FRONTED: "partner-funded salary correction",
    JournalEntrySource.EXPENSE_ENTRY: "expense entry correction",
    JournalEntrySource.PARTNER_PROFIT_ALLOCATION: "partner profit allocation correction",
    JournalEntrySource.DELIVERY_COMMISSION: "delivery commission invoice correction",
}

# Paired feature records with no dedicated correction API yet — never generic-correct.
# CARD_SALES / CASH_MOVEMENT from a posted PosDailySummary: use correct_pos_daily_summary().
VOID_AND_REENTER_SOURCES: frozenset[JournalEntrySource] = frozenset(
    {
        JournalEntrySource.OPENING_BALANCE,
        JournalEntrySource.TRANSFER,
        JournalEntrySource.POS_SETTLEMENT,
        JournalEntrySource.CARD_SALES,
        JournalEntrySource.POS_CARD_TIP,
        JournalEntrySource.DELIVERY_REPORT,
        JournalEntrySource.DELIVERY_SETTLEMENT,
        JournalEntrySource.CREDIT_CARD_PAYMENT,
        JournalEntrySource.CASH_MOVEMENT,
        JournalEntrySource.CASH_DRAWER_CLOSE,
        JournalEntrySource.RULE_AUTO,
        JournalEntrySource.SYSTEM,
        JournalEntrySource.PARTNER_SUPPLIER_PAID,
        JournalEntrySource.EXPENSE_PERSONAL_SPLIT,
        JournalEntrySource.PARTNER_CAPITAL_CONTRIBUTION,
        JournalEntrySource.PARTNER_LOAN_RECEIVED,
        JournalEntrySource.PARTNER_LOAN_REPAID,
        # A year-end close is derived entirely from the year's balances, so
        # editing its amounts by hand is meaningless — the next read would
        # disagree with the books. Voiding it reopens the year for re-closing,
        # which recomputes from whatever the balances now say.
        JournalEntrySource.YEAR_END_CLOSE,
    }
)


def verify_correction_source_registry_complete() -> None:
    """Fail fast if a JournalEntrySource is not classified for generic correct."""
    all_sources = set(JournalEntrySource)
    classified = (
        set(GENERIC_CORRECTABLE_SOURCES)
        | set(DEDICATED_CORRECTION_ROUTES.keys())
        | set(VOID_AND_REENTER_SOURCES)
    )
    if classified != all_sources:
        missing = sorted(s.value for s in all_sources - classified)
        extra = sorted(s.value for s in classified - all_sources)
        raise AssertionError(
            f"correction registry incomplete: missing={missing!r} extra={extra!r}"
        )
    if GENERIC_CORRECTABLE_SOURCES & set(DEDICATED_CORRECTION_ROUTES.keys()):
        raise AssertionError("source cannot be both generic-correctable and dedicated")
    if GENERIC_CORRECTABLE_SOURCES & VOID_AND_REENTER_SOURCES:
        raise AssertionError("source cannot be both generic-correctable and void-and-reenter")
    if set(DEDICATED_CORRECTION_ROUTES.keys()) & VOID_AND_REENTER_SOURCES:
        raise AssertionError("source cannot be both dedicated and void-and-reenter")


def is_generic_correctable(source: JournalEntrySource) -> bool:
    return source in GENERIC_CORRECTABLE_SOURCES


def resolve_correction_route(source: JournalEntrySource) -> str:
    """Human-readable message naming the required correction flow."""
    if source in GENERIC_CORRECTABLE_SOURCES:
        raise ValueError(f"source {source.value} is generic-correctable")
    dedicated = DEDICATED_CORRECTION_ROUTES.get(source)
    if dedicated is not None:
        return f"use the {dedicated} flow"
    return "void the entry and re-enter"
