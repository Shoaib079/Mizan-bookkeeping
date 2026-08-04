"""Partner-facing labels for ledger enums.

Books language only — what the money *is*, never how the app posted it.
Internal tags (``rule_auto``, ``system``, sweeps, batches) are remapped or
worded as ordinary bookkeeping. ``partner_sources`` resolves ``RULE_AUTO`` to
the economic type before these labels are applied.
"""

from __future__ import annotations

from app.core.ledger.models import JournalEntrySource

# Partner-facing wording — short enough for a column, clear enough to audit.
_JOURNAL_SOURCE_LABELS: dict[str, str] = {
    JournalEntrySource.MANUAL.value: "Adjustment",
    JournalEntrySource.OPENING_BALANCE.value: "Opening balance",
    JournalEntrySource.INVOICE.value: "Supplier invoice",
    JournalEntrySource.PAYMENT.value: "Supplier payment",
    JournalEntrySource.TRANSFER.value: "Transfer",
    JournalEntrySource.POS_SETTLEMENT.value: "Card deposit",
    JournalEntrySource.CARD_SALES.value: "Card sales",
    JournalEntrySource.POS_CARD_TIP.value: "Card tip",
    JournalEntrySource.POS_COMMISSION_SWEEP.value: "Card commission",
    JournalEntrySource.POS_COMMISSION_STATEMENT.value: "Card commission",
    JournalEntrySource.DELIVERY_REPORT.value: "Delivery sales",
    JournalEntrySource.DELIVERY_SETTLEMENT.value: "Delivery deposit",
    JournalEntrySource.DELIVERY_COMMISSION.value: "Delivery commission",
    JournalEntrySource.BANK_FEE.value: "Bank fee",
    JournalEntrySource.CREDIT_CARD_PAYMENT.value: "Credit card payment",
    JournalEntrySource.CASH_MOVEMENT.value: "Cash movement",
    JournalEntrySource.CASH_DRAWER_CLOSE.value: "Cash drawer count",
    JournalEntrySource.FX_PURCHASE.value: "Foreign currency purchase",
    JournalEntrySource.STAFF_ACCRUAL.value: "Salary accrual",
    JournalEntrySource.STAFF_ADVANCE.value: "Staff advance",
    JournalEntrySource.STAFF_PAYMENT.value: "Salary payment",
    JournalEntrySource.PARTNER_EXPENSE_FRONTED.value: "Partner paid expense",
    JournalEntrySource.PARTNER_REIMBURSEMENT_PAID.value: "Partner reimbursement",
    JournalEntrySource.PARTNER_DRAWING.value: "Partner drawing",
    JournalEntrySource.PARTNER_DRAWING_REPAYMENT.value: "Partner drawing repayment",
    JournalEntrySource.PARTNER_CAPITAL_CONTRIBUTION.value: "Partner capital",
    JournalEntrySource.PARTNER_LOAN_RECEIVED.value: "Partner loan received",
    JournalEntrySource.PARTNER_LOAN_REPAID.value: "Partner loan repaid",
    JournalEntrySource.PARTNER_PROFIT_ALLOCATION.value: "Partner profit share",
    JournalEntrySource.PARTNER_PROFIT_PAID.value: "Partner profit paid",
    JournalEntrySource.PARTNER_SUPPLIER_PAID.value: "Partner paid supplier",
    JournalEntrySource.EXPENSE_PERSONAL_SPLIT.value: "Expense personal split",
    JournalEntrySource.CUSTOMER_CREDIT_SALE.value: "Customer credit sale",
    JournalEntrySource.GROUP_SALE.value: "Group sale",
    JournalEntrySource.CUSTOMER_PAYMENT_RECEIVED.value: "Customer payment",
    JournalEntrySource.FX_CONVERSION.value: "Foreign currency conversion",
    JournalEntrySource.FX_EXPENSE_SPEND.value: "Foreign currency expense",
    JournalEntrySource.EXPENSE_ENTRY.value: "Miscellaneous expense",
    JournalEntrySource.YEAR_END_CLOSE.value: "Year-end close",
    # Used for other bank income and some reversals — never say "System".
    JournalEntrySource.SYSTEM.value: "Other income",
    # Ledger audit tag; reports remap via partner_sources before labeling.
    JournalEntrySource.RULE_AUTO.value: "Bank transaction",
}

_STAFF_MOVEMENT_LABELS: dict[str, str] = {
    "salary_accrual": "Salary accrual",
    "salary_payment": "Salary payment",
    "advance": "Advance",
    "advance_repayment": "Advance repayment",
    "extra_days_accrued": "Extra days accrued",
    "extra_days_paid": "Extra days paid",
    "incentive": "Incentive",
    "incentive_payment": "Incentive payment",
}

# Words that mean "how the app works" — partner books must never show these.
_PARTNER_FORBIDDEN_LABEL_WORDS = frozenset(
    {
        "auto",
        "rule",
        "system",
        "sweep",
        "batch",
        "import",
        "classify",
        "classification",
        "token",
        "heuristic",
        "ai",
    }
)


def format_journal_source(source: object) -> str:
    raw = source.value if hasattr(source, "value") else str(source or "")
    raw = raw.strip()
    if not raw:
        return ""
    return _JOURNAL_SOURCE_LABELS.get(raw, raw.replace("_", " ").title())


def format_staff_movement(movement_type: object) -> str:
    raw = movement_type.value if hasattr(movement_type, "value") else str(movement_type or "")
    raw = raw.strip()
    if not raw:
        return ""
    return _STAFF_MOVEMENT_LABELS.get(raw, raw.replace("_", " ").title())


def assert_partner_journal_labels_complete() -> None:
    """Fail fast if a journal source has no partner label or uses app jargon."""
    missing = sorted(
        s.value for s in JournalEntrySource if s.value not in _JOURNAL_SOURCE_LABELS
    )
    if missing:
        raise AssertionError(
            f"partner journal labels missing for sources: {missing!r}"
        )
    for code, label in _JOURNAL_SOURCE_LABELS.items():
        words = {w.strip(".,()").lower() for w in label.split()}
        bad = sorted(words & _PARTNER_FORBIDDEN_LABEL_WORDS)
        if bad:
            raise AssertionError(
                f"partner label for {code!r} uses app jargon {bad!r}: {label!r}"
            )
