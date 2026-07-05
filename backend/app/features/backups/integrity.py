"""Restore verification — ledger and subledger integrity checks (Phase 8)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.adapters.storage import upload_exists as stored_upload_exists
from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_PAYABLE_CODE,
    ACCOUNTS_RECEIVABLE_CODE,
    EMPLOYEE_ADVANCES_CODE,
    PARTNER_REIMBURSEMENT_PAYABLE_CODE,
    SALARIES_PAYABLE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.balances import balance_as_of_kurus
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntryStatus
from app.core.partners import ledger as partners_ledger
from app.core.payables.models import SupplierLedgerEntry
from app.core.receivables import ledger as receivables_ledger
from app.core.staff.models import StaffLedgerEntry
from app.db.session import entity_context
from app.features.banking.statement_models import BankStatement
from app.features.entities.models import Entity
from app.features.invoices.models import InvoiceDraft
from app.features.reports.financial_statements import get_balance_sheet


class IntegrityCheckError(RuntimeError):
    """One or more post-restore integrity checks failed."""


@dataclass
class IntegrityReport:
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def fail(self, message: str) -> None:
        self.errors.append(message)


def _journal_entries_balance(session: Session, report: IntegrityReport) -> None:
    rows = session.execute(
        select(
            JournalEntry.id,
            JournalEntry.entity_id,
            JournalEntryLine.side,
            func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0),
        )
        .join(JournalEntryLine, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .where(JournalEntry.status == JournalEntryStatus.POSTED.value)
        .group_by(JournalEntry.id, JournalEntry.entity_id, JournalEntryLine.side)
    ).all()

    totals: dict[uuid.UUID, dict[str, int]] = {}
    for entry_id, _entity_id, side, amount in rows:
        bucket = totals.setdefault(entry_id, {"debit": 0, "credit": 0})
        if side == AccountNormalBalance.DEBIT:
            bucket["debit"] = int(amount)
        else:
            bucket["credit"] = int(amount)

    for entry_id, amounts in totals.items():
        if amounts["debit"] != amounts["credit"]:
            report.fail(
                f"journal entry {entry_id} unbalanced: "
                f"debits={amounts['debit']} credits={amounts['credit']}"
            )


def _account_gl_balance(session: Session, entity_id: uuid.UUID, code: str) -> int:
    with entity_context(session, entity_id):
        account = session.scalar(select(Account).where(Account.code == code))
        if account is None:
            return 0
        return balance_as_of_kurus(session, account, date.max)


def _supplier_subledger_total(session: Session, entity_id: uuid.UUID) -> int:
    with entity_context(session, entity_id):
        total = session.scalar(select(func.coalesce(func.sum(SupplierLedgerEntry.amount_kurus), 0)))
        return int(total or 0)


def _staff_subledger_total(session: Session, entity_id: uuid.UUID) -> int:
    with entity_context(session, entity_id):
        total = session.scalar(select(func.coalesce(func.sum(StaffLedgerEntry.amount_minor), 0)))
        return int(total or 0)


def _control_accounts_tie(session: Session, entity_id: uuid.UUID, report: IntegrityReport) -> None:
    ap_gl = _account_gl_balance(session, entity_id, ACCOUNTS_PAYABLE_CODE)
    ap_sub = _supplier_subledger_total(session, entity_id)
    if ap_gl != ap_sub:
        report.fail(
            f"entity {entity_id}: AP {ACCOUNTS_PAYABLE_CODE} GL {ap_gl} != supplier subledger {ap_sub}"
        )

    ar_gl = _account_gl_balance(session, entity_id, ACCOUNTS_RECEIVABLE_CODE)
    ar_sub = receivables_ledger.entity_total_balance_kurus(session, entity_id)
    if ar_gl != ar_sub:
        report.fail(
            f"entity {entity_id}: AR {ACCOUNTS_RECEIVABLE_CODE} GL {ar_gl} != receivables subledger {ar_sub}"
        )

    partner_gl = _account_gl_balance(session, entity_id, PARTNER_REIMBURSEMENT_PAYABLE_CODE)
    partner_sub = partners_ledger.entity_total_balance_kurus(session, entity_id)
    if partner_gl != partner_sub:
        report.fail(
            f"entity {entity_id}: partner GL {partner_gl} != partner subledger {partner_sub}"
        )

    salaries_gl = _account_gl_balance(session, entity_id, SALARIES_PAYABLE_CODE)
    advances_gl = _account_gl_balance(session, entity_id, EMPLOYEE_ADVANCES_CODE)
    staff_sub = _staff_subledger_total(session, entity_id)
    expected_staff = salaries_gl - advances_gl
    if staff_sub != expected_staff:
        report.fail(
            f"entity {entity_id}: staff subledger {staff_sub} != "
            f"2250({salaries_gl}) - 1300({advances_gl})"
        )


def _trial_balance_per_entity(session: Session, entity_id: uuid.UUID, report: IntegrityReport) -> None:
    sheet = get_balance_sheet(session, entity_id, date.max)
    if not sheet.accounting_equation_balanced:
        report.fail(
            f"entity {entity_id}: accounting equation not balanced "
            f"(assets={sheet.total_assets_kurus} L+E={sheet.total_liabilities_and_equity_kurus})"
        )


def _upload_references_exist(session: Session, uploads_root: Path, report: IntegrityReport) -> None:
    for draft in session.scalars(select(InvoiceDraft)):
        stored = (draft.extraction_payload or {}).get("stored_path")
        if not stored:
            continue
        if not _upload_exists(stored, uploads_root):
            report.fail(f"invoice draft {draft.id} missing upload file {stored!r}")

    for statement in session.scalars(select(BankStatement)):
        if not _upload_exists(statement.storage_path, uploads_root):
            report.fail(
                f"bank statement {statement.id} missing upload file {statement.storage_path!r}"
            )


def _upload_exists(stored_path: str, uploads_root: Path) -> bool:
    if stored_upload_exists(stored_path):
        return True
    path = Path(stored_path)
    uploads_root = uploads_root.resolve()
    if path.exists():
        try:
            path.resolve().relative_to(uploads_root)
            return True
        except ValueError:
            return True
    candidate = uploads_root / path.name
    if candidate.exists():
        return True
    for match in uploads_root.rglob(path.name):
        if match.is_file():
            return True
    return False


def _orphaned_journal_references(session: Session, report: IntegrityReport) -> None:
    checks = [
        (SupplierLedgerEntry, "supplier_ledger_entries"),
        (StaffLedgerEntry, "staff_ledger_entries"),
    ]
    for model, label in checks:
        rows = session.execute(
            select(model.journal_entry_id).where(model.journal_entry_id.isnot(None)).distinct()
        ).all()
        for (journal_id,) in rows:
            if journal_id is None:
                continue
            if session.get(JournalEntry, journal_id) is None:
                report.fail(f"{label} references missing journal entry {journal_id}")


def verify_restored_database(
    database_url: str,
    *,
    uploads_root: Path | None = None,
) -> IntegrityReport:
    """Run all post-restore integrity checks; fails loudly via IntegrityCheckError."""
    engine = create_engine(database_url, pool_pre_ping=True)
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = session_factory()
    report = IntegrityReport()

    try:
        _journal_entries_balance(session, report)
        entities = list(session.scalars(select(Entity)))
        for entity in entities:
            _trial_balance_per_entity(session, entity.id, report)
            _control_accounts_tie(session, entity.id, report)
        _orphaned_journal_references(session, report)
        if uploads_root is not None:
            _upload_references_exist(session, uploads_root, report)
    finally:
        session.close()
        engine.dispose()

    if not report.ok:
        raise IntegrityCheckError("; ".join(report.errors))
    return report
