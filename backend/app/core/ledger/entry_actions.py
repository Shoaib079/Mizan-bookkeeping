"""Resolve edit/void targets for a journal entry — used by the GL inline actions."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ledger.correction import (
    DEDICATED_CORRECTION_ROUTES,
    GENERIC_CORRECTABLE_SOURCES,
    VOID_AND_REENTER_SOURCES,
    is_generic_correctable,
)
from app.core.ledger.models import JournalEntry, JournalEntrySource, JournalEntryStatus
from app.core.partners.models import PartnerLedgerEntry
from app.core.staff.models import StaffLedgerEntry
from app.core.receivables.models import CustomerLedgerEntry
from app.core.payables.models import SupplierLedgerEntry
from app.core.fx.models import FxLedgerEntry
from app.core.ledger.posting import EntryNotFoundError
from app.db.session import entity_context, require_entity_context
from app.features.expenses.models import ExpenseEntry
from app.features.entities import service as entity_service
from app.features.pos.models import CardSalesBatch, PosSettlement
from app.features.delivery.models import DeliveryReport, DeliverySettlement


@dataclass(frozen=True, slots=True)
class LedgerEntryEditContext:
    kind: str
    context: dict[str, Any]


@dataclass(frozen=True, slots=True)
class LedgerEntryActions:
    can_edit: bool
    can_void: bool
    void_path: str | None
    edit: LedgerEntryEditContext | None = None


def _generic_void_path(entry_id: uuid.UUID) -> str:
    return f"ledger/entries/{entry_id}/void"


def _is_generic_void_safe(source: JournalEntrySource) -> bool:
    if source in GENERIC_CORRECTABLE_SOURCES:
        return True
    return source in {
        JournalEntrySource.TRANSFER,
        JournalEntrySource.YEAR_END_CLOSE,
        JournalEntrySource.CASH_DRAWER_CLOSE,
    }


def resolve_ledger_entry_actions(
    session: Session,
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
) -> LedgerEntryActions:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        entry = session.get(JournalEntry, entry_id)
        if entry is None:
            raise EntryNotFoundError("Journal entry not found")
        if entry.status != JournalEntryStatus.POSTED:
            return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)

        source = entry.source

        if is_generic_correctable(source):
            return LedgerEntryActions(
                can_edit=True,
                can_void=True,
                void_path=_generic_void_path(entry_id),
                edit=LedgerEntryEditContext(kind="generic_ledger", context={}),
            )

        if _is_generic_void_safe(source):
            return LedgerEntryActions(
                can_edit=False,
                can_void=True,
                void_path=_generic_void_path(entry_id),
            )

        if source == JournalEntrySource.EXPENSE_ENTRY:
            expense = session.scalar(
                select(ExpenseEntry).where(ExpenseEntry.journal_entry_id == entry_id)
            )
            if expense is None:
                return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
            return LedgerEntryActions(
                can_edit=True,
                can_void=True,
                void_path=f"expenses/{expense.id}/void",
                edit=LedgerEntryEditContext(
                    kind="expense",
                    context={
                        "id": str(expense.id),
                        "expense_date": expense.expense_date.isoformat(),
                        "description": expense.description,
                        "written_item_description": expense.written_item_description,
                        "notes": expense.notes,
                        "amount_kurus": expense.amount_kurus,
                        "expense_account_id": str(expense.expense_account_id),
                        "money_account_id": str(expense.money_account_id),
                        "status": expense.status.value,
                        "journal_entry_id": str(expense.journal_entry_id),
                    },
                ),
            )

        if source in {
            JournalEntrySource.PARTNER_EXPENSE_FRONTED,
            JournalEntrySource.PARTNER_REIMBURSEMENT_PAID,
            JournalEntrySource.PARTNER_DRAWING,
            JournalEntrySource.PARTNER_DRAWING_REPAYMENT,
        }:
            row = session.scalar(
                select(PartnerLedgerEntry).where(
                    PartnerLedgerEntry.journal_entry_id == entry_id
                )
            )
            if row is None:
                return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
            return LedgerEntryActions(
                can_edit=True,
                can_void=True,
                void_path=(
                    f"partners/{row.partner_id}/ledger/{entry_id}/void"
                ),
                edit=LedgerEntryEditContext(
                    kind="partner_ledger",
                    context={
                        "partner_id": str(row.partner_id),
                        "movement_type": row.movement_type.value,
                        "movement_date": row.movement_date.isoformat(),
                        "amount_kurus": row.amount_kurus,
                        "description": row.description,
                    },
                ),
            )

        if source in {
            JournalEntrySource.PARTNER_CAPITAL_CONTRIBUTION,
            JournalEntrySource.PARTNER_LOAN_RECEIVED,
            JournalEntrySource.PARTNER_LOAN_REPAID,
        }:
            row = session.scalar(
                select(PartnerLedgerEntry).where(
                    PartnerLedgerEntry.journal_entry_id == entry_id
                )
            )
            if row is None:
                return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
            return LedgerEntryActions(
                can_edit=False,
                can_void=True,
                void_path=(
                    f"partners/{row.partner_id}/ledger/{entry_id}/void"
                ),
            )

        if source == JournalEntrySource.PARTNER_PROFIT_ALLOCATION:
            return LedgerEntryActions(
                can_edit=False,
                can_void=True,
                void_path=f"partners/profit-allocation/{entry_id}/void",
            )

        if source in {
            JournalEntrySource.STAFF_ACCRUAL,
            JournalEntrySource.STAFF_ADVANCE,
            JournalEntrySource.STAFF_PAYMENT,
        }:
            row = session.scalar(
                select(StaffLedgerEntry).where(
                    StaffLedgerEntry.journal_entry_id == entry_id
                )
            )
            if row is None:
                return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
            return LedgerEntryActions(
                can_edit=True,
                can_void=True,
                void_path=(
                    f"staff/employees/{row.employee_id}/ledger/{entry_id}/void"
                ),
                edit=LedgerEntryEditContext(
                    kind="staff_ledger",
                    context={
                        "employee_id": str(row.employee_id),
                        "movement_type": row.movement_type.value,
                        "movement_date": row.movement_date.isoformat(),
                        "amount_minor": row.amount_minor,
                        "description": row.description,
                        "extra_days": row.extra_days,
                    },
                ),
            )

        if source == JournalEntrySource.CUSTOMER_PAYMENT_RECEIVED:
            row = session.scalar(
                select(CustomerLedgerEntry).where(
                    CustomerLedgerEntry.journal_entry_id == entry_id
                )
            )
            if row is None:
                return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
            return LedgerEntryActions(
                can_edit=True,
                can_void=True,
                void_path=(
                    f"customers/{row.customer_id}/payments/{entry_id}/void"
                ),
                edit=LedgerEntryEditContext(
                    kind="customer_payment",
                    context={
                        "customer_id": str(row.customer_id),
                        "movement_date": row.movement_date.isoformat(),
                        "amount_kurus": row.amount_kurus,
                        "description": row.description,
                        "payment_native_quantity": row.payment_native_quantity,
                        "forex_currency": row.forex_currency,
                    },
                ),
            )

        if source in {
            JournalEntrySource.CUSTOMER_CREDIT_SALE,
            JournalEntrySource.GROUP_SALE,
        }:
            row = session.scalar(
                select(CustomerLedgerEntry).where(
                    CustomerLedgerEntry.journal_entry_id == entry_id
                )
            )
            if row is None:
                return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
            if source == JournalEntrySource.GROUP_SALE and row.reference_id is not None:
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
                void_path=(
                    f"customers/{row.customer_id}/credit-sales/{entry_id}/void"
                ),
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

        if source == JournalEntrySource.PAYMENT:
            row = session.scalar(
                select(SupplierLedgerEntry).where(
                    SupplierLedgerEntry.journal_entry_id == entry_id
                )
            )
            if row is None:
                return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
            return LedgerEntryActions(
                can_edit=True,
                can_void=True,
                void_path=(
                    f"payables/suppliers/{row.supplier_id}/payments/{entry_id}/void"
                ),
                edit=LedgerEntryEditContext(
                    kind="supplier_payment",
                    context={
                        "supplier_id": str(row.supplier_id),
                        "movement_date": row.movement_date.isoformat(),
                        "amount_kurus": row.amount_kurus,
                        "description": row.description,
                    },
                ),
            )

        if source == JournalEntrySource.INVOICE:
            row = session.scalar(
                select(SupplierLedgerEntry).where(
                    SupplierLedgerEntry.journal_entry_id == entry_id
                )
            )
            if row is None:
                return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
            return LedgerEntryActions(
                can_edit=True,
                can_void=True,
                void_path=(
                    f"payables/suppliers/{row.supplier_id}/invoices/{entry_id}/void"
                ),
                edit=LedgerEntryEditContext(
                    kind="supplier_invoice",
                    context={
                        "supplier_id": str(row.supplier_id),
                        "movement_date": row.movement_date.isoformat(),
                        "amount_kurus": row.amount_kurus,
                        "description": row.description,
                    },
                ),
            )

        if source == JournalEntrySource.FX_PURCHASE:
            row = session.scalar(
                select(FxLedgerEntry).where(FxLedgerEntry.journal_entry_id == entry_id)
            )
            if row is None:
                return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
            return LedgerEntryActions(
                can_edit=True,
                can_void=True,
                void_path=f"fx/purchases/{entry_id}/void",
                edit=LedgerEntryEditContext(
                    kind="fx_purchase",
                    context={
                        "movement_date": row.movement_date.isoformat(),
                        "native_quantity": row.native_quantity,
                        "try_cost_kurus": row.try_cost_kurus,
                        "description": row.description,
                    },
                ),
            )

        if source in {
            JournalEntrySource.FX_CONVERSION,
            JournalEntrySource.FX_EXPENSE_SPEND,
        }:
            row = session.scalar(
                select(FxLedgerEntry).where(FxLedgerEntry.journal_entry_id == entry_id)
            )
            if row is None:
                return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
            return LedgerEntryActions(
                can_edit=True,
                can_void=True,
                void_path=f"fx/ledger/{entry_id}/void",
                edit=LedgerEntryEditContext(
                    kind="fx_ledger",
                    context={
                        "movement_date": row.movement_date.isoformat(),
                        "movement_type": row.movement_type.value,
                        "native_quantity": row.native_quantity,
                        "try_cost_kurus": row.try_cost_kurus,
                        "description": row.description,
                        "journal_source": source.value,
                        "fx_money_account_id": str(row.fx_money_account_id),
                    },
                ),
            )

        if source == JournalEntrySource.CARD_SALES:
            batch = session.scalar(
                select(CardSalesBatch).where(CardSalesBatch.journal_entry_id == entry_id)
            )
            if batch is None:
                return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
            return LedgerEntryActions(
                can_edit=False,
                can_void=True,
                void_path=f"pos/card-sales/{batch.id}/void",
            )

        if source == JournalEntrySource.POS_SETTLEMENT:
            settlement = session.scalar(
                select(PosSettlement).where(
                    PosSettlement.journal_entry_id == entry_id
                )
            )
            if settlement is None:
                return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
            return LedgerEntryActions(
                can_edit=False,
                can_void=True,
                void_path=f"pos/settlements/{settlement.id}/void",
            )

        if source == JournalEntrySource.DELIVERY_REPORT:
            report = session.scalar(
                select(DeliveryReport).where(DeliveryReport.journal_entry_id == entry_id)
            )
            if report is None:
                return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
            return LedgerEntryActions(
                can_edit=False,
                can_void=True,
                void_path=f"delivery/reports/{report.id}/void",
            )

        if source == JournalEntrySource.DELIVERY_SETTLEMENT:
            settlement = session.scalar(
                select(DeliverySettlement).where(
                    DeliverySettlement.journal_entry_id == entry_id
                )
            )
            if settlement is None:
                return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
            return LedgerEntryActions(
                can_edit=False,
                can_void=True,
                void_path=f"delivery/settlements/{settlement.id}/void",
            )

        if source in VOID_AND_REENTER_SOURCES:
            if source in {
                JournalEntrySource.RULE_AUTO,
                JournalEntrySource.SYSTEM,
            }:
                return LedgerEntryActions(
                    can_edit=False,
                    can_void=True,
                    void_path=_generic_void_path(entry_id),
                )
            return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)

        if source in DEDICATED_CORRECTION_ROUTES:
            return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)

        return LedgerEntryActions(can_edit=False, can_void=False, void_path=None)
