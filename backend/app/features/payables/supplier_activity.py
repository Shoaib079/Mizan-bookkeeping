"""Supplier activity timeline — one chronological view (Decisions §8)."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntry
from app.core.ledger.subledger_display import SubledgerDisplayKind, classify_subledger_row
from app.core.payables.ledger import list_ledger_entries
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.db.session import entity_context, require_entity_context
from app.features.banking.statement_models import BankStatement, BankStatementLine
from app.features.banking.statements import BANK_STATEMENT_LINE_REF
from app.features.entities import service as entity_service
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceKind
from app.features.banking.models import MoneyAccount
from app.features.payables import invoice_edit
from app.features.payables.schema import SupplierActivityRead, SupplierActivityRow
from app.features.suppliers import service as supplier_service

_INVOICE_DRAFT_REF = "invoice_draft"


def _vat_total_kurus(draft: InvoiceDraft) -> int:
    breakdown = draft.vat_breakdown or []
    return sum(int(line.get("vat_kurus", 0)) for line in breakdown)


def _movement_label(movement_type: SupplierMovementType) -> str:
    return {
        SupplierMovementType.OPENING_BALANCE: "Açılış",
        SupplierMovementType.INVOICE: "Fatura",
        SupplierMovementType.PAYMENT: "Ödeme",
        SupplierMovementType.ADJUSTMENT: "Düzeltme",
        SupplierMovementType.CREDIT_NOTE: "İade",
    }.get(movement_type, movement_type.value)


def _draft_status_label(status: InvoiceDraftStatus) -> str:
    if status == InvoiceDraftStatus.CONFIRMED:
        return "Onaylı — kaydedilmedi"
    if status == InvoiceDraftStatus.NEEDS_REVIEW:
        return "İnceleme gerekli"
    if status == InvoiceDraftStatus.DRAFT:
        return "Taslak"
    return status.value


def _has_stored_document(draft: InvoiceDraft) -> bool:
    stored = (draft.extraction_payload or {}).get("stored_path")
    if not isinstance(stored, str) or not stored.strip():
        return False
    return Path(stored).expanduser().is_file()


def _payment_details(
    session: Session,
    entry: SupplierLedgerEntry,
) -> tuple[str | None, str | None, str | None]:
    """Return (bank_label, dekont, detail_suffix)."""
    if entry.reference_type == BANK_STATEMENT_LINE_REF and entry.reference_id is not None:
        line = session.get(BankStatementLine, entry.reference_id)
        if line is None:
            return None, None, entry.description
        statement = session.get(BankStatement, line.statement_id)
        bank_label: str | None = None
        if statement is not None:
            account = session.get(MoneyAccount, statement.money_account_id)
            if account is not None:
                bank_label = account.name
        dekont = line.reference or None
        detail = line.description or entry.description
        return bank_label, dekont, detail

    dekont = entry.reference_type if entry.reference_type else None
    return None, dekont, entry.description


def _invoice_draft_for_entry(
    session: Session, entry: SupplierLedgerEntry
) -> InvoiceDraft | None:
    if entry.reference_type != _INVOICE_DRAFT_REF or entry.reference_id is None:
        return None
    return session.get(InvoiceDraft, entry.reference_id)


def get_supplier_activity(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    *,
    from_date: date,
    to_date: date,
) -> SupplierActivityRead:
    if from_date > to_date:
        raise ValueError("from must be on or before to")

    entity_service.get_entity(session, entity_id)
    supplier = supplier_service.get_supplier(session, entity_id, supplier_id)
    supplier_name = supplier.name
    supplier_vkn = supplier.vkn

    with entity_context(session, entity_id):
        require_entity_context()
        entries = list_ledger_entries(session, entity_id, supplier_id)

        running_before = sum(
            e.amount_kurus
            for e in entries
            if e.movement_date < from_date
        )

        raw_rows: list[tuple[date, int, SupplierActivityRow]] = []

        raw_rows.append(
            (
                from_date,
                0,
                SupplierActivityRow(
                    movement_date=from_date,
                    movement_kind="opening",
                    movement_label="Açılış",
                    document_ref="—",
                    detail="Dönem başı bakiye",
                    net_kurus=None,
                    vat_kurus=None,
                    amount_kurus=None,
                    bank_name=None,
                    dekont_ref=None,
                    balance_kurus=running_before,
                    affects_balance=True,
                    invoice_draft_id=None,
                    journal_entry_id=None,
                    has_document=False,
                ),
            )
        )

        running = running_before
        for entry in entries:
            if entry.movement_date < from_date or entry.movement_date > to_date:
                continue

            journal = (
                session.get(JournalEntry, entry.journal_entry_id)
                if entry.journal_entry_id is not None
                else None
            )
            display_kind, was_corrected = classify_subledger_row(
                description=entry.description,
                journal=journal,
            )
            is_void_reversal = display_kind == SubledgerDisplayKind.VOID_REVERSAL
            is_superseded = display_kind == SubledgerDisplayKind.SUPERSEDED

            net_kurus: int | None = None
            vat_kurus: int | None = None
            amount_kurus: int | None = None
            bank_name: str | None = None
            dekont_ref: str | None = None
            detail = entry.description
            document_ref = "—"
            invoice_draft_id: uuid.UUID | None = None
            has_document = False
            can_edit = False
            expense_account_id: uuid.UUID | None = None
            draft_journal_entry_id: uuid.UUID | None = None

            movement_label = _movement_label(entry.movement_type)
            affects_balance = True

            if entry.movement_type == SupplierMovementType.INVOICE:
                draft = _invoice_draft_for_entry(session, entry)

                if draft is not None:
                    invoice_draft_id = draft.id
                    draft_journal_entry_id = draft.journal_entry_id
                    document_ref = draft.invoice_number
                    has_document = _has_stored_document(draft)

                if is_void_reversal:
                    amount_kurus = entry.amount_kurus
                    movement_label = "İptal"
                    detail = entry.description
                    document_ref = (
                        draft.invoice_number if draft is not None else document_ref
                    )
                elif is_superseded:
                    amount_kurus = entry.amount_kurus
                    movement_label = "Fatura (iptal edildi)"
                    detail = entry.description
                    affects_balance = False
                    if draft is not None:
                        net_kurus = draft.net_kurus
                        vat_kurus = _vat_total_kurus(draft)
                elif draft is not None:
                    net_kurus = draft.net_kurus
                    vat_kurus = _vat_total_kurus(draft)
                    amount_kurus = draft.gross_kurus
                    detail = f"Kayıtlı · {draft.invoice_number}"
                else:
                    amount_kurus = entry.amount_kurus
                    document_ref = entry.description[:64]

                if journal is not None and not is_void_reversal:
                    can_edit = invoice_edit.supplier_invoice_row_is_editable(
                        session,
                        entry,
                        draft_journal_entry_id=draft_journal_entry_id,
                    )
                    if can_edit:
                        expense_account_id = invoice_edit.expense_account_id_from_journal(
                            session,
                            entity_id,
                            journal,
                        )
            elif entry.movement_type == SupplierMovementType.CREDIT_NOTE:
                draft = _invoice_draft_for_entry(session, entry)

                if draft is not None:
                    invoice_draft_id = draft.id
                    draft_journal_entry_id = draft.journal_entry_id
                    document_ref = draft.invoice_number
                    has_document = _has_stored_document(draft)

                if is_void_reversal:
                    amount_kurus = entry.amount_kurus
                    movement_label = "İptal"
                    detail = entry.description
                    document_ref = (
                        draft.invoice_number if draft is not None else document_ref
                    )
                elif is_superseded:
                    amount_kurus = entry.amount_kurus
                    movement_label = "İade (iptal edildi)"
                    detail = entry.description
                    affects_balance = False
                    if draft is not None:
                        net_kurus = -draft.net_kurus
                        vat_kurus = -_vat_total_kurus(draft)
                elif draft is not None:
                    net_kurus = -draft.net_kurus
                    vat_kurus = -_vat_total_kurus(draft)
                    amount_kurus = -draft.gross_kurus
                    detail = f"İade · {draft.invoice_number}"
                    if draft.referenced_invoice_number:
                        detail = (
                            f"{detail} (iadeye konu: {draft.referenced_invoice_number})"
                        )
                else:
                    amount_kurus = entry.amount_kurus
                    document_ref = entry.description[:64]
            elif entry.movement_type == SupplierMovementType.PAYMENT:
                amount_kurus = abs(entry.amount_kurus)
                bank_name, dekont_ref, detail = _payment_details(session, entry)
                document_ref = dekont_ref or "—"
            else:
                amount_kurus = abs(entry.amount_kurus) if entry.amount_kurus else None
                document_ref = entry.description[:64] if entry.description else "—"

            if is_void_reversal:
                movement_label = "İptal"
            if display_kind != SubledgerDisplayKind.EFFECTIVE:
                can_edit = False

            running += entry.amount_kurus
            raw_rows.append(
                (
                    entry.movement_date,
                    1,
                    SupplierActivityRow(
                        movement_date=entry.movement_date,
                        movement_kind=entry.movement_type.value,
                        movement_label=movement_label,
                        document_ref=document_ref,
                        detail=detail,
                        net_kurus=net_kurus,
                        vat_kurus=vat_kurus,
                        amount_kurus=amount_kurus,
                        bank_name=bank_name,
                        dekont_ref=dekont_ref,
                        balance_kurus=running,
                        affects_balance=affects_balance,
                        invoice_draft_id=invoice_draft_id,
                        journal_entry_id=entry.journal_entry_id,
                        has_document=has_document,
                        can_edit=can_edit,
                        expense_account_id=expense_account_id,
                        display_kind=display_kind,
                        was_corrected=was_corrected,
                    ),
                )
            )

        posted_draft_ids = {
            e.reference_id
            for e in entries
            if e.reference_type == _INVOICE_DRAFT_REF and e.reference_id is not None
        }

        unposted_drafts = list(
            session.scalars(
                select(InvoiceDraft).where(
                    InvoiceDraft.supplier_id == supplier_id,
                    InvoiceDraft.invoice_kind.in_(
                        (
                            InvoiceKind.SUPPLIER.value,
                            InvoiceKind.SUPPLIER_CREDIT.value,
                        )
                    ),
                    InvoiceDraft.status.in_(
                        [
                            InvoiceDraftStatus.DRAFT.value,
                            InvoiceDraftStatus.NEEDS_REVIEW.value,
                            InvoiceDraftStatus.CONFIRMED.value,
                        ]
                    ),
                    InvoiceDraft.invoice_date >= from_date,
                    InvoiceDraft.invoice_date <= to_date,
                )
            )
        )

        for draft in unposted_drafts:
            if draft.id in posted_draft_ids:
                continue
            vat = _vat_total_kurus(draft)
            is_credit = InvoiceKind(draft.invoice_kind) == InvoiceKind.SUPPLIER_CREDIT
            raw_rows.append(
                (
                    draft.invoice_date,
                    2,
                    SupplierActivityRow(
                        movement_date=draft.invoice_date,
                        movement_kind="unposted_invoice",
                        movement_label="İade" if is_credit else "Fatura",
                        document_ref=draft.invoice_number,
                        detail=_draft_status_label(InvoiceDraftStatus(draft.status)),
                        net_kurus=-draft.net_kurus if is_credit else draft.net_kurus,
                        vat_kurus=-vat if is_credit else vat,
                        amount_kurus=-draft.gross_kurus if is_credit else draft.gross_kurus,
                        bank_name=None,
                        dekont_ref=None,
                        balance_kurus=running,
                        affects_balance=False,
                        invoice_draft_id=draft.id,
                        journal_entry_id=None,
                        has_document=_has_stored_document(draft),
                    ),
                )
            )

        raw_rows.append(
            (
                to_date,
                99,
                SupplierActivityRow(
                    movement_date=to_date,
                    movement_kind="closing",
                    movement_label="Kapanış",
                    document_ref="—",
                    detail="Kayıtlı hareketler sonrası bakiye",
                    net_kurus=None,
                    vat_kurus=None,
                    amount_kurus=None,
                    bank_name=None,
                    dekont_ref=None,
                    balance_kurus=running,
                    affects_balance=True,
                    invoice_draft_id=None,
                    journal_entry_id=None,
                    has_document=False,
                ),
            )
        )

        raw_rows.sort(key=lambda item: (item[0], item[1], item[2].document_ref))

    rows = [item[2] for item in raw_rows]

    # Restore which money account each payment used so the edit form reopens with
    # the recorded account instead of defaulting to the first in the list.
    from app.features.banking.journal_money_account import (
        money_account_gl_by_journal_entry,
    )

    payment_je_ids = [
        r.journal_entry_id
        for r in rows
        if r.movement_kind == "payment" and r.journal_entry_id is not None
    ]
    if payment_je_ids:
        with entity_context(session, entity_id):
            account_by_je = money_account_gl_by_journal_entry(session, payment_je_ids)
        for r in rows:
            if r.movement_kind == "payment" and r.journal_entry_id in account_by_je:
                r.payment_account_id = account_by_je[r.journal_entry_id]

    invoices_gross = sum(
        r.amount_kurus or 0
        for r in rows
        if r.movement_kind == "invoice"
        and r.affects_balance
        and (r.amount_kurus or 0) > 0
    ) + sum(
        r.amount_kurus or 0
        for r in rows
        if r.movement_kind == "credit_note"
        and r.affects_balance
    ) + sum(
        r.amount_kurus or 0
        for r in rows
        if r.movement_kind == "unposted_invoice"
    )
    payments_total = sum(
        r.amount_kurus or 0 for r in rows if r.movement_kind == "payment"
    )
    vat_total = sum(
        r.vat_kurus or 0
        for r in rows
        if r.movement_kind == "invoice"
        and r.affects_balance
        and (r.amount_kurus or 0) > 0
    ) + sum(
        r.vat_kurus or 0
        for r in rows
        if r.movement_kind == "credit_note"
        and r.affects_balance
    ) + sum(
        r.vat_kurus or 0
        for r in rows
        if r.movement_kind == "unposted_invoice"
    )

    return SupplierActivityRead(
        supplier_id=supplier_id,
        supplier_name=supplier_name,
        supplier_vkn=supplier_vkn,
        from_date=from_date,
        to_date=to_date,
        opening_balance_kurus=running_before,
        closing_balance_kurus=running,
        total_invoices_gross_kurus=invoices_gross,
        total_payments_kurus=payments_total,
        total_vat_kurus=vat_total,
        rows=rows,
    )
