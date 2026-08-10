"""One table saying what can be edited or voided, per journal source.

Phase 2, step 1. **Nothing calls this yet.** It is built beside
`resolve_ledger_entry_actions` and pinned to it by an equivalence test, so the
old code is the specification and the test says the new code agrees. Only when
that is green does the resolver switch over.

Why a table at all: "can this be edited or voided" is currently decided in
five places that must agree, and they agree by coincidence. Every reported
void/edit bug over months has been two of those five disagreeing — a registry
that said void-only against a resolver with no branch, a path built for a
route that did not exist, an Edit button on a kind the UI could not open.
There is no second opinion to drift from a single table.

The shape of every answer is the same three steps, which is what makes a
table possible:

  1. find the subledger row that owns this entry (different model per source)
  2. build the void path from that row's owner id
  3. build the edit context from the row's fields

Two sources genuinely cannot be expressed this way, and rather than bend the
table into a shape the code does not have, they carry a `resolve` function and
a written reason. `_ESCAPES_WITH_REASONS` keeps them visible so the exception
does not quietly become the norm.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.fx.models import FxLedgerEntry
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.partners.models import PartnerLedgerEntry
from app.core.payables.models import SupplierLedgerEntry
from app.core.receivables.models import CustomerLedgerEntry
from app.core.staff.models import StaffLedgerEntry
from app.features.delivery.models import DeliveryReport, DeliverySettlement
from app.features.expenses.models import ExpenseEntry
from app.features.invoices.models import InvoiceDraft as _InvoiceDraft
from app.features.pos.models import CardSalesBatch, PosSettlement


@dataclass(frozen=True, slots=True)
class Owner:
    """Where to find the subledger row that owns an entry, and its owner id.

    `id_field` is the column naming who the row belongs to — the partner, the
    supplier, the employee. It is what fills `{owner_id}` in a void path.
    Some rows are their own owner (an expense voids at `expenses/{its own id}`),
    which is `id_field="id"`.
    """

    model: type
    id_field: str


@dataclass(frozen=True, slots=True)
class Capability:
    """What the app may offer for one journal source.

    `void_path` is a template over `{owner_id}` and `{entry_id}`. Written as a
    template rather than an f-string so a scan can resolve every path against
    the router without executing anything — the guard that already caught
    three paths carrying a `payables/` segment no route had.
    """

    can_edit: bool
    can_void: bool
    owner: Owner | None = None
    void_path: str | None = None
    edit_kind: str | None = None
    # (session, entry, row) -> the edit form's fields. Takes the session
    # because one context (profit allocation) is computed from the entry's
    # own lines against the chart, not read off a subledger row.
    context: Callable[[Session, JournalEntry, Any], dict] | None = None
    # Correcting this source rewrites a single subledger row, so an entry that
    # owns several cannot be corrected without losing one.
    #
    # `correct_staff_journal_entry` reads one row with `session.scalar` and
    # reposts one row. A salary payment that consumed an advance writes two —
    # SALARY_PAYMENT and ADVANCE_APPLIED — and a period payment writes three.
    # Correcting one of those drops the others, and `scalar` does not promise
    # which row it hands back, so it might keep the offset and drop the
    # payment. The employee's advance balance is wrong afterwards and nothing
    # says so.
    #
    # The staff *page* has always refused this. The General ledger offered it,
    # because the resolver answered from the source alone. Voiding stays
    # available: it reverses the whole entry, which is right — every row of a
    # staff payment belongs to the same employee.
    edit_needs_a_sole_row: bool = False
    # Where to count owners, when that is not where the row comes from.
    #
    # A profit allocation needs no `owner`: its void path is keyed on the
    # entry and its edit context is read off the entry's own lines. But it is
    # the one source that spans several owners, which is exactly what a
    # partner page needs to know. Kept as its own field rather than giving the
    # capability an `owner` it does not use, because `owner` also decides
    # "return nothing when the row is missing" — and an allocation should not
    # start depending on that.
    counts_owners: Owner | None = None
    # The escape hatch. Set only for the two sources whose answer depends on
    # which row is found, not on the source.
    resolve: Callable[[Session, JournalEntry], Any] | None = None


# --- edit contexts -------------------------------------------------------
# One function per kind, lifted from the branch that used to build it inline.


def _expense_context(_session: Session, _entry: JournalEntry, row: Any) -> dict:
    return {
        "id": str(row.id),
        "expense_date": row.expense_date.isoformat(),
        "description": row.description,
        "written_item_description": row.written_item_description,
        "notes": row.notes,
        "amount_kurus": row.amount_kurus,
        "expense_account_id": str(row.expense_account_id),
        "money_account_id": str(row.money_account_id),
        "status": row.status.value,
        "journal_entry_id": str(row.journal_entry_id),
    }


def _partner_ledger_context(_session: Session, _entry: JournalEntry, row: Any) -> dict:
    return {
        "partner_id": str(row.partner_id),
        "movement_type": row.movement_type.value,
        "movement_date": row.movement_date.isoformat(),
        "amount_kurus": row.amount_kurus,
        "description": row.description,
    }


def _staff_ledger_context(_session: Session, _entry: JournalEntry, row: Any) -> dict:
    return {
        "employee_id": str(row.employee_id),
        "movement_type": row.movement_type.value,
        "movement_date": row.movement_date.isoformat(),
        "amount_minor": row.amount_minor,
        "description": row.description,
        "extra_days": row.extra_days,
    }


def _customer_payment_context(_session: Session, _entry: JournalEntry, row: Any) -> dict:
    return {
        "customer_id": str(row.customer_id),
        "movement_date": row.movement_date.isoformat(),
        "amount_kurus": row.amount_kurus,
        "description": row.description,
        "payment_native_quantity": row.payment_native_quantity,
        "forex_currency": row.forex_currency,
    }


def _supplier_row_context(_session: Session, _entry: JournalEntry, row: Any) -> dict:
    return {
        "supplier_id": str(row.supplier_id),
        "movement_date": row.movement_date.isoformat(),
        "amount_kurus": row.amount_kurus,
        "description": row.description,
    }


def _fx_purchase_context(_session: Session, _entry: JournalEntry, row: Any) -> dict:
    return {
        "movement_date": row.movement_date.isoformat(),
        "native_quantity": row.native_quantity,
        "try_cost_kurus": row.try_cost_kurus,
        "description": row.description,
    }


def _fx_ledger_context(_session: Session, entry: JournalEntry, row: Any) -> dict:
    return {
        "movement_date": row.movement_date.isoformat(),
        "movement_type": row.movement_type.value,
        "native_quantity": row.native_quantity,
        "try_cost_kurus": row.try_cost_kurus,
        "description": row.description,
        "journal_source": entry.source.value,
        "fx_money_account_id": str(row.fx_money_account_id),
    }


def _delivery_commission_context(
    _session: Session, entry: JournalEntry, row: Any
) -> dict:
    return {
        "draft_id": str(row.id),
        "invoice_number": row.invoice_number,
        "movement_date": row.invoice_date.isoformat(),
        "net_kurus": row.net_kurus,
        "gross_kurus": row.gross_kurus,
        "description": entry.description,
    }


def _profit_allocation_context(
    session: Session, entry: JournalEntry, _row: Any
) -> dict:
    """Read off the entry's own lines — there is no subledger row to read.

    The allocated profit is whatever was debited to retained earnings, which
    is why this one needs the session and the others do not.
    """
    from app.core.chart_of_accounts.default_chart import RETAINED_EARNINGS_CODE
    from app.core.chart_of_accounts.models import Account
    from app.core.chart_of_accounts.types import AccountNormalBalance

    retained = session.scalar(
        select(Account).where(Account.code == RETAINED_EARNINGS_CODE)
    )
    profit_kurus = 0
    if retained is not None:
        profit_kurus = sum(
            line.amount_kurus
            for line in entry.lines
            if line.account_id == retained.id
            and line.side == AccountNormalBalance.DEBIT
        )
    return {
        "journal_entry_id": str(entry.id),
        "allocation_date": entry.entry_date.isoformat(),
        "description": entry.description,
        "profit_kurus": profit_kurus,
    }


# --- the table -----------------------------------------------------------

PARTNER = Owner(PartnerLedgerEntry, "partner_id")
SUPPLIER = Owner(SupplierLedgerEntry, "supplier_id")
PARTNER_VOID = "partners/{owner_id}/ledger/{entry_id}/void"

# Two rules run *before* this table and are deliberately not restated in it,
# because both are already defined as sets elsewhere and copying them here is
# the exact mistake this whole phase is about:
#
#   is_generic_correctable(source)  -> edit + void, ledger/entries/{id}/void,
#                                      kind `generic_ledger`
#   _is_generic_void_safe(source)   -> void only, same path
#
# That is why TRANSFER, YEAR_END_CLOSE and CASH_DRAWER_CLOSE have no row below:
# they are answered by the second rule and never reach the table.
CAPABILITIES: dict[JournalEntrySource, Capability] = {
    JournalEntrySource.EXPENSE_ENTRY: Capability(
        can_edit=True,
        can_void=True,
        owner=Owner(ExpenseEntry, "id"),
        void_path="expenses/{owner_id}/void",
        edit_kind="expense",
        context=_expense_context,
    ),
    # --- partner subledger: same row, same path, different verdicts -------
    JournalEntrySource.PARTNER_EXPENSE_FRONTED: Capability(
        can_edit=True, can_void=True, owner=PARTNER, void_path=PARTNER_VOID,
        edit_kind="partner_ledger", context=_partner_ledger_context,
    ),
    JournalEntrySource.PARTNER_REIMBURSEMENT_PAID: Capability(
        can_edit=True, can_void=True, owner=PARTNER, void_path=PARTNER_VOID,
        edit_kind="partner_ledger", context=_partner_ledger_context,
    ),
    JournalEntrySource.PARTNER_DRAWING: Capability(
        can_edit=True, can_void=True, owner=PARTNER, void_path=PARTNER_VOID,
        edit_kind="partner_ledger", context=_partner_ledger_context,
    ),
    JournalEntrySource.PARTNER_DRAWING_REPAYMENT: Capability(
        can_edit=True, can_void=True, owner=PARTNER, void_path=PARTNER_VOID,
        edit_kind="partner_ledger", context=_partner_ledger_context,
    ),
    JournalEntrySource.PARTNER_CAPITAL_CONTRIBUTION: Capability(
        can_edit=False, can_void=True, owner=PARTNER, void_path=PARTNER_VOID,
    ),
    JournalEntrySource.PARTNER_LOAN_RECEIVED: Capability(
        can_edit=False, can_void=True, owner=PARTNER, void_path=PARTNER_VOID,
    ),
    JournalEntrySource.PARTNER_LOAN_REPAID: Capability(
        can_edit=False, can_void=True, owner=PARTNER, void_path=PARTNER_VOID,
    ),
    JournalEntrySource.PARTNER_PROFIT_PAID: Capability(
        can_edit=False, can_void=True, owner=PARTNER, void_path=PARTNER_VOID,
    ),
    JournalEntrySource.EXPENSE_PERSONAL_SPLIT: Capability(
        can_edit=False, can_void=True, owner=PARTNER, void_path=PARTNER_VOID,
    ),
    JournalEntrySource.PARTNER_PROFIT_ALLOCATION: Capability(
        can_edit=True,
        can_void=True,
        void_path="partners/profit-allocation/{entry_id}/void",
        edit_kind="partner_profit_allocation",
        context=_profit_allocation_context,
        # The only source that spans several owners: one row per partner
        # against a single entry. A partner page showing one of those rows
        # must not offer to void it — that reverses everyone's share.
        counts_owners=PARTNER,
    ),
    # --- staff -----------------------------------------------------------
    JournalEntrySource.STAFF_ACCRUAL: Capability(
        can_edit=True, can_void=True,
        owner=Owner(StaffLedgerEntry, "employee_id"),
        void_path="staff/employees/{owner_id}/ledger/{entry_id}/void",
        edit_kind="staff_ledger", context=_staff_ledger_context,
        edit_needs_a_sole_row=True,
    ),
    JournalEntrySource.STAFF_ADVANCE: Capability(
        can_edit=True, can_void=True,
        owner=Owner(StaffLedgerEntry, "employee_id"),
        void_path="staff/employees/{owner_id}/ledger/{entry_id}/void",
        edit_kind="staff_ledger", context=_staff_ledger_context,
        edit_needs_a_sole_row=True,
    ),
    JournalEntrySource.STAFF_PAYMENT: Capability(
        can_edit=True, can_void=True,
        owner=Owner(StaffLedgerEntry, "employee_id"),
        void_path="staff/employees/{owner_id}/ledger/{entry_id}/void",
        edit_kind="staff_ledger", context=_staff_ledger_context,
        edit_needs_a_sole_row=True,
    ),
    # --- customers and suppliers ------------------------------------------
    JournalEntrySource.CUSTOMER_PAYMENT_RECEIVED: Capability(
        can_edit=True, can_void=True,
        owner=Owner(CustomerLedgerEntry, "customer_id"),
        void_path="customers/{owner_id}/payments/{entry_id}/void",
        edit_kind="customer_payment", context=_customer_payment_context,
    ),
    JournalEntrySource.PAYMENT: Capability(
        can_edit=True, can_void=True, owner=SUPPLIER,
        void_path="suppliers/{owner_id}/payments/{entry_id}/void",
        edit_kind="supplier_payment", context=_supplier_row_context,
    ),
    JournalEntrySource.DELIVERY_COMMISSION: Capability(
        can_edit=True,
        can_void=True,
        owner=Owner(_InvoiceDraft, "id"),
        void_path="invoices/delivery-commission/{entry_id}/void",
        edit_kind="delivery_commission",
        context=_delivery_commission_context,
    ),
    # --- everything keyed on its own record -------------------------------
    JournalEntrySource.FX_PURCHASE: Capability(
        can_edit=True, can_void=True,
        owner=Owner(FxLedgerEntry, "id"),
        void_path="fx/purchases/{entry_id}/void",
        edit_kind="fx_purchase", context=_fx_purchase_context,
    ),
    JournalEntrySource.FX_CONVERSION: Capability(
        can_edit=True, can_void=True,
        owner=Owner(FxLedgerEntry, "id"),
        void_path="fx/ledger/{entry_id}/void",
        edit_kind="fx_ledger", context=_fx_ledger_context,
    ),
    JournalEntrySource.FX_EXPENSE_SPEND: Capability(
        can_edit=True, can_void=True,
        owner=Owner(FxLedgerEntry, "id"),
        void_path="fx/ledger/{entry_id}/void",
        edit_kind="fx_ledger", context=_fx_ledger_context,
    ),
    JournalEntrySource.CARD_SALES: Capability(
        can_edit=False, can_void=True,
        owner=Owner(CardSalesBatch, "id"),
        void_path="pos/card-sales/{owner_id}/void",
    ),
    JournalEntrySource.POS_SETTLEMENT: Capability(
        can_edit=False, can_void=True,
        owner=Owner(PosSettlement, "id"),
        void_path="pos/settlements/{owner_id}/void",
    ),
    JournalEntrySource.DELIVERY_REPORT: Capability(
        can_edit=False, can_void=True,
        owner=Owner(DeliveryReport, "id"),
        void_path="delivery/reports/{owner_id}/void",
    ),
    JournalEntrySource.DELIVERY_SETTLEMENT: Capability(
        can_edit=False, can_void=True,
        owner=Owner(DeliverySettlement, "id"),
        void_path="delivery/settlements/{owner_id}/void",
    ),
    # --- voided from the ledger, never edited -----------------------------
    # Only these two of VOID_AND_REENTER_SOURCES get a path. The rest offer
    # nothing at all — which the first mechanical reading of the resolver got
    # wrong, because it stopped at the enclosing `if` and never saw the inner
    # one that singles these two out.
    JournalEntrySource.RULE_AUTO: Capability(
        can_edit=False, can_void=True, void_path="ledger/entries/{entry_id}/void",
    ),
    JournalEntrySource.SYSTEM: Capability(
        can_edit=False, can_void=True, void_path="ledger/entries/{entry_id}/void",
    ),
    # --- offers nothing from the ledger, on purpose -----------------------
    # These reach the resolver's final `return` today, 500 lines down, by
    # exhausting every branch above. Written out here instead: a source that
    # offers no buttons should say so, because "nothing" and "nobody
    # classified this yet" look identical on screen and are entirely
    # different problems.
    #
    # Each is corrected through the record that owns it rather than through
    # the ledger — a cash movement or card tip through its POS daily summary,
    # a credit card payment through the card, an opening balance through
    # onboarding. Voiding half of one from the General ledger would leave the
    # other half standing.
    JournalEntrySource.CASH_MOVEMENT: Capability(can_edit=False, can_void=False),
    JournalEntrySource.POS_CARD_TIP: Capability(can_edit=False, can_void=False),
    JournalEntrySource.CREDIT_CARD_PAYMENT: Capability(can_edit=False, can_void=False),
    JournalEntrySource.OPENING_BALANCE: Capability(can_edit=False, can_void=False),
}


# --- the two answers a table cannot give ---------------------------------


def _group_sale_or_credit_sale(session: Session, entry: JournalEntry):
    """One source, two answers, decided by whether the row names a group sale."""
    from app.core.ledger.entry_actions import (
        LedgerEntryActions,
        LedgerEntryEditContext,
    )

    from app.core.receivables.models import CustomerMovementType

    row = session.scalar(
        select(CustomerLedgerEntry).where(
            CustomerLedgerEntry.journal_entry_id == entry.id
        )
    )
    if row is None:
        return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)

    # A write-off and a group-sale discount both post under GROUP_SALE, and a
    # discount against a sale also carries that sale's `reference_id`. Read in
    # the order below, that made a discount look exactly like the sale itself:
    # pressing Void on 200 TL knocked off a group sale voided the **whole
    # sale**. The route exists, so nothing failed — it reversed the wrong
    # record, which is the one outcome worse than a button that does nothing.
    #
    # A plain write-off had the opposite problem: no `reference_id`, so it fell
    # through to the credit-sale route, which rejects a DISCOUNT row. A dead
    # button, failing safely.
    #
    # Both are the same movement type and both void through the same endpoint,
    # which accepts any DISCOUNT row. Checked first, because it is the narrower
    # question: what the row *is* beats what its source and reference imply.
    #
    # Void only, though `/write-offs/{id}/correct` does exist. The General
    # ledger has no form for it — `gl-entry-actions.tsx` has no write-off case
    # — and the fallback it used to take opened a *credit-sale* form, which
    # posts to a route that rejects a DISCOUNT row. Correcting a write-off
    # works on the customer page, which owns the right form.
    #
    # So this is a capability the ledger declines to offer rather than one the
    # app lacks. Wiring it is a form, not a rule; see HARDENING_PLAN.md D3.
    if row.movement_type == CustomerMovementType.DISCOUNT:
        return LedgerEntryActions(
            can_edit=False,
            can_void=True,
            void_path=f"customers/{row.customer_id}/write-offs/{entry.id}/void",
        )

    if entry.source == JournalEntrySource.GROUP_SALE and row.reference_id is not None:
        return LedgerEntryActions(
            can_edit=True,
            can_void=True,
            void_path=f"group-sales/{row.reference_id}/void",
            edit=LedgerEntryEditContext(
                kind="group_sale",
                context={"group_sale_id": str(row.reference_id)},
            ),
        )
    return LedgerEntryActions(
        can_edit=True,
        can_void=True,
        void_path=f"customers/{row.customer_id}/credit-sales/{entry.id}/void",
        edit=LedgerEntryEditContext(
            kind="customer_credit_sale",
            context={
                "customer_id": str(row.customer_id),
                "movement_date": row.movement_date.isoformat(),
                "amount_kurus": row.amount_kurus,
                "description": row.description,
            },
        ),
    )


def _supplier_invoice_or_credit_note(session: Session, entry: JournalEntry):
    """One source, two documents that move the payable opposite ways.

    A supplier credit note (iade) posts under source `INVOICE` with a
    `CREDIT_NOTE` movement type. It used to be answered with no buttons at
    all: `void_supplier_invoice` refuses it by movement type and nothing else
    accepted it, so a wrong iade stayed in the books permanently. Honest, and
    still stuck.

    It now has its own void route. There is no correction route yet, so Edit
    stays off — voiding and re-uploading the document is the way through, and
    the draft is released so the same file is accepted again.
    """
    from app.core.ledger.entry_actions import (
        LedgerEntryActions,
        LedgerEntryEditContext,
    )
    from app.core.payables.models import SupplierMovementType

    row = session.scalar(
        select(SupplierLedgerEntry).where(
            SupplierLedgerEntry.journal_entry_id == entry.id
        )
    )
    if row is None:
        return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)

    if row.movement_type == SupplierMovementType.CREDIT_NOTE:
        return LedgerEntryActions(
            can_edit=False,
            can_void=True,
            void_path=(
                f"suppliers/{row.supplier_id}/credit-notes/{entry.id}/void"
            ),
        )
    if row.movement_type != SupplierMovementType.INVOICE:
        return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)

    return LedgerEntryActions(
        can_edit=True,
        can_void=True,
        void_path=f"suppliers/{row.supplier_id}/invoices/{entry.id}/void",
        edit=LedgerEntryEditContext(
            kind="supplier_invoice",
            context=_supplier_row_context(session, entry, row),
        ),
    )


def _partner_supplier_paid(session: Session, entry: JournalEntry):
    """Voids through the partner, unless there is no partner row to void through.

    A personal-only AP clear has no partner subledger row — the money never
    went through a partner's account — so it voids through the supplier
    instead. Two owner models for one source, which is why it cannot be a row.
    """
    from app.core.ledger.entry_actions import LedgerEntryActions

    partner_row = session.scalar(
        select(PartnerLedgerEntry).where(
            PartnerLedgerEntry.journal_entry_id == entry.id
        )
    )
    if partner_row is not None:
        return LedgerEntryActions(
            can_edit=False,
            can_void=True,
            void_path=f"partners/{partner_row.partner_id}/ledger/{entry.id}/void",
        )
    supplier_row = session.scalar(
        select(SupplierLedgerEntry).where(
            SupplierLedgerEntry.journal_entry_id == entry.id
        )
    )
    if supplier_row is None:
        return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
    return LedgerEntryActions(
        can_edit=False,
        can_void=True,
        void_path=f"suppliers/{supplier_row.supplier_id}/payments/{entry.id}/void",
    )


ESCAPES: dict[JournalEntrySource, Callable[[Session, JournalEntry], Any]] = {
    JournalEntrySource.INVOICE: _supplier_invoice_or_credit_note,
    JournalEntrySource.CUSTOMER_CREDIT_SALE: _group_sale_or_credit_sale,
    JournalEntrySource.GROUP_SALE: _group_sale_or_credit_sale,
    JournalEntrySource.PARTNER_SUPPLIER_PAID: _partner_supplier_paid,
}


def resolve_from_table(session: Session, entry: JournalEntry):
    """The answer for a posted entry, from the table.

    Deliberately mirrors the order of the resolver it will replace: the two
    generic rules first, then the escapes, then the table. Order matters —
    several sources appear in both a generic set and the table, and the first
    match wins in the original, so it must win here.
    """
    from app.core.ledger.entry_actions import (
        LedgerEntryActions,
        LedgerEntryEditContext,
        _generic_void_path,
        _is_generic_void_safe,
    )
    from app.core.ledger.correction import is_generic_correctable

    none_at_all = LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
    source = entry.source

    if is_generic_correctable(source):
        return LedgerEntryActions(
            can_edit=True,
            can_void=True,
            void_path=_generic_void_path(entry.id),
            edit=LedgerEntryEditContext(kind="generic_ledger", context={}),
        )
    if _is_generic_void_safe(source):
        return LedgerEntryActions(
            can_edit=False, can_void=True, void_path=_generic_void_path(entry.id)
        )

    escape = ESCAPES.get(source)
    if escape is not None:
        return escape(session, entry)

    cap = CAPABILITIES.get(source)
    if cap is None:
        return none_at_all
    if not cap.can_edit and not cap.can_void:
        return none_at_all

    row = None
    rows: list[Any] = []
    owner_count = 1
    if cap.owner is not None:
        # All of them, not the first. Two facts come out of this one query and
        # both were previously invisible: how many rows an entry owns, and how
        # many *owners* those rows belong to. They are different questions and
        # the difference decides two separate things.
        rows = list(
            session.scalars(
                select(cap.owner.model).where(
                    cap.owner.model.journal_entry_id == entry.id
                )
            )
        )
        # No owning record means the entry is not what its source claims, and
        # every branch in the original agreed: offer nothing rather than a
        # button that will not find its target.
        if not rows:
            return none_at_all
        row = rows[0]
        owner_count = len({getattr(r, cap.owner.id_field) for r in rows})

    if cap.counts_owners is not None:
        counter = cap.counts_owners
        owner_count = len(
            {
                owner_id
                for (owner_id,) in session.execute(
                    select(getattr(counter.model, counter.id_field)).where(
                        counter.model.journal_entry_id == entry.id
                    )
                )
            }
        ) or 1

    can_edit = cap.can_edit
    if cap.edit_needs_a_sole_row and len(rows) > 1:
        # Correcting would rewrite one row and lose the rest.
        can_edit = False

    void_path = None
    if cap.void_path is not None:
        owner_id = getattr(row, cap.owner.id_field) if cap.owner else None
        void_path = cap.void_path.format(owner_id=owner_id, entry_id=entry.id)

    edit = None
    if can_edit and cap.edit_kind is not None and cap.context is not None:
        edit = LedgerEntryEditContext(
            kind=cap.edit_kind, context=cap.context(session, entry, row)
        )

    return LedgerEntryActions(
        can_edit=can_edit,
        can_void=cap.can_void,
        void_path=void_path,
        edit=edit,
        owner_count=owner_count,
    )


_ESCAPES_WITH_REASONS: dict[JournalEntrySource, str] = {
    JournalEntrySource.INVOICE: (
        "a supplier credit note (iade) posts under this source with a "
        "CREDIT_NOTE movement type and moves the payable the opposite way, so "
        "it voids through its own route and cannot be corrected in place. An "
        "ordinary invoice does both. Two documents, one source, decided by the "
        "row."
    ),
    JournalEntrySource.CUSTOMER_CREDIT_SALE: (
        "a group sale carrying a reference_id voids at group-sales/{id}/void "
        "and edits as `group_sale`; without one — and for every plain credit "
        "sale — it is customers/{customer_id}/credit-sales/{entry_id}/void "
        "and `customer_credit_sale`. Two answers from one source, decided by "
        "the row."
    ),
    JournalEntrySource.GROUP_SALE: "same row, same fork — see CUSTOMER_CREDIT_SALE",
    JournalEntrySource.PARTNER_SUPPLIER_PAID: (
        "voids through the partner subledger when a partner row exists; a "
        "personal-only AP clear has none and voids through the supplier "
        "instead. Two different owner models for one source."
    ),
}
