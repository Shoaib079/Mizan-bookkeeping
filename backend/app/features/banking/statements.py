"""Bank statement import and line classification (Decisions §12)."""

from __future__ import annotations

import hashlib
import uuid
from datetime import date

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.adapters.bank_parsers.csv_simple import CsvParseError, parse_csv_simple
from app.adapters.storage.local import save_upload
from app.core.payables import posting as payables_posting
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.banking.schema import (
    BankStatementLineRead,
    BankStatementRead,
    ClassifyStatementLineResult,
)
from app.features.banking.statement_models import (
    BankStatement,
    BankStatementLine,
    StatementLineClassification,
    StatementLineStatus,
)
from app.features.entities import service as entity_service
from app.features.suppliers.models import Supplier

BANK_STATEMENT_LINE_REF = "bank_statement_line"


class DuplicateStatementError(Exception):
    """Raised when the same file fingerprint was already imported for this entity."""


class OverlappingPeriodError(Exception):
    """Raised when statement period overlaps an existing import for the same account."""


class NotBankAccountError(Exception):
    """Raised when import targets a non-bank money account."""


class LineAlreadyResolvedError(Exception):
    """Raised when re-classifying a posted or linked line."""


class InvalidClassificationError(ValueError):
    """Raised when classification preconditions fail."""


def file_fingerprint(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _to_line_read(line: BankStatementLine) -> BankStatementLineRead:
    return BankStatementLineRead(
        id=line.id,
        statement_id=line.statement_id,
        transaction_date=line.transaction_date,
        amount_kurus=line.amount_kurus,
        description=line.description,
        reference=line.reference,
        classification=line.classification,
        status=line.status,
        supplier_id=line.supplier_id,
        journal_entry_id=line.journal_entry_id,
        supplier_ledger_entry_id=line.supplier_ledger_entry_id,
    )


def _to_statement_read(
    statement: BankStatement, lines: list[BankStatementLine]
) -> BankStatementRead:
    return BankStatementRead(
        id=statement.id,
        entity_id=statement.entity_id,
        money_account_id=statement.money_account_id,
        file_fingerprint=statement.file_fingerprint,
        period_start=statement.period_start,
        period_end=statement.period_end,
        original_filename=statement.original_filename,
        line_count=statement.line_count,
        imported_at=statement.imported_at,
        lines=[_to_line_read(line) for line in lines],
    )


def _get_bank_money_account(
    session: Session, money_account_id: uuid.UUID
) -> MoneyAccount:
    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None:
        raise LookupError("Money account not found")
    if money_account.account_kind != MoneyAccountKind.BANK:
        raise NotBankAccountError("Bank statements can only be imported for bank accounts")
    return money_account


def _period_overlaps(
    session: Session,
    money_account_id: uuid.UUID,
    period_start: date,
    period_end: date,
) -> bool:
    existing = session.scalar(
        select(BankStatement.id).where(
            BankStatement.money_account_id == money_account_id,
            BankStatement.period_start <= period_end,
            BankStatement.period_end >= period_start,
        )
    )
    return existing is not None


def _find_matching_payment(
    session: Session,
    *,
    supplier_id: uuid.UUID,
    amount_kurus: int,
    transaction_date: date,
    exclude_line_id: uuid.UUID | None = None,
) -> SupplierLedgerEntry | None:
    payment_amount = abs(amount_kurus)
    used_entry_ids = select(BankStatementLine.supplier_ledger_entry_id).where(
        BankStatementLine.supplier_ledger_entry_id.isnot(None)
    )
    if exclude_line_id is not None:
        used_entry_ids = used_entry_ids.where(BankStatementLine.id != exclude_line_id)

    return session.scalar(
        select(SupplierLedgerEntry)
        .where(
            SupplierLedgerEntry.supplier_id == supplier_id,
            SupplierLedgerEntry.movement_type == SupplierMovementType.PAYMENT,
            SupplierLedgerEntry.movement_date == transaction_date,
            SupplierLedgerEntry.amount_kurus == -payment_amount,
            SupplierLedgerEntry.id.not_in(used_entry_ids),
        )
        .order_by(SupplierLedgerEntry.created_at)
        .limit(1)
    )


def import_bank_statement(
    session: Session,
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    content: bytes,
    *,
    original_filename: str,
) -> BankStatementRead:
    """Parse CSV, store file, create statement + lines. Rejects duplicates and overlaps."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    fingerprint = file_fingerprint(content)
    try:
        parsed = parse_csv_simple(content)
    except CsvParseError as exc:
        raise InvalidClassificationError(str(exc)) from exc

    with entity_context(session, entity_id):
        require_entity_context()
        _get_bank_money_account(session, money_account_id)

        existing_fingerprint = session.scalar(
            select(BankStatement.id).where(BankStatement.file_fingerprint == fingerprint)
        )
        if existing_fingerprint is not None:
            raise DuplicateStatementError(
                "This bank statement file was already imported for this entity"
            )

        if _period_overlaps(
            session,
            money_account_id,
            parsed.period_start,
            parsed.period_end,
        ):
            raise OverlappingPeriodError(
                "Statement period overlaps an existing import for this bank account"
            )

        storage_path = save_upload(
            entity_id,
            fingerprint,
            content,
            extension=".csv",
        )

        statement = BankStatement(
            money_account_id=money_account_id,
            file_fingerprint=fingerprint,
            period_start=parsed.period_start,
            period_end=parsed.period_end,
            original_filename=original_filename,
            storage_path=storage_path,
            line_count=len(parsed.lines),
        )
        session.add(statement)
        try:
            session.flush()
        except IntegrityError as exc:
            session.rollback()
            raise DuplicateStatementError(
                "This bank statement file was already imported for this entity"
            ) from exc

        lines: list[BankStatementLine] = []
        for row in parsed.lines:
            line = BankStatementLine(
                statement_id=statement.id,
                transaction_date=row.transaction_date,
                amount_kurus=row.amount_kurus,
                description=row.description,
                reference=row.reference,
                classification=StatementLineClassification.UNCLASSIFIED,
                status=StatementLineStatus.IMPORTED,
            )
            session.add(line)
            lines.append(line)

        session.commit()
        session.refresh(statement)
        for line in lines:
            session.refresh(line)
        return _to_statement_read(statement, lines)


def get_bank_statement(
    session: Session, entity_id: uuid.UUID, statement_id: uuid.UUID
) -> BankStatementRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        statement = session.get(BankStatement, statement_id)
        if statement is None:
            raise LookupError("Bank statement not found")
        lines = list(
            session.scalars(
                select(BankStatementLine)
                .where(BankStatementLine.statement_id == statement_id)
                .order_by(
                    BankStatementLine.transaction_date,
                    BankStatementLine.id,
                )
            )
        )
        return _to_statement_read(statement, lines)


def list_bank_statements(
    session: Session,
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
) -> list[BankStatementRead]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        _get_bank_money_account(session, money_account_id)
        statements = session.scalars(
            select(BankStatement)
            .where(BankStatement.money_account_id == money_account_id)
            .order_by(BankStatement.imported_at.desc())
        ).all()
        results: list[BankStatementRead] = []
        for statement in statements:
            lines = list(
                session.scalars(
                    select(BankStatementLine)
                    .where(BankStatementLine.statement_id == statement.id)
                    .order_by(
                        BankStatementLine.transaction_date,
                        BankStatementLine.id,
                    )
                )
            )
            results.append(_to_statement_read(statement, lines))
        return results


def classify_statement_line(
    session: Session,
    entity_id: uuid.UUID,
    statement_id: uuid.UUID,
    line_id: uuid.UUID,
    *,
    classification: StatementLineClassification,
    supplier_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
) -> ClassifyStatementLineResult:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        statement = session.get(BankStatement, statement_id)
        if statement is None:
            raise LookupError("Bank statement not found")

        line = session.get(BankStatementLine, line_id)
        if line is None or line.statement_id != statement_id:
            raise LookupError("Statement line not found")

        if line.status in (StatementLineStatus.POSTED, StatementLineStatus.LINKED):
            raise LineAlreadyResolvedError(
                "Cannot re-classify a line that is already posted or linked"
            )

        money_account = _get_bank_money_account(session, statement.money_account_id)

        if classification == StatementLineClassification.SUPPLIER_PAYMENT:
            if line.amount_kurus >= 0:
                raise InvalidClassificationError(
                    "supplier_payment classification requires an outflow (negative amount_kurus)"
                )
            if supplier_id is None or actor_id is None:
                raise InvalidClassificationError(
                    "supplier_id and actor_id are required for supplier_payment"
                )
            supplier = session.get(Supplier, supplier_id)
            if supplier is None:
                raise LookupError("Supplier not found")

            existing = _find_matching_payment(
                session,
                supplier_id=supplier_id,
                amount_kurus=line.amount_kurus,
                transaction_date=line.transaction_date,
                exclude_line_id=line.id,
            )
            if existing is not None:
                line.classification = classification
                line.status = StatementLineStatus.LINKED
                line.supplier_id = supplier_id
                line.journal_entry_id = existing.journal_entry_id
                line.supplier_ledger_entry_id = existing.id
                session.commit()
                session.refresh(line)
                return ClassifyStatementLineResult(
                    line=_to_line_read(line),
                    linked_existing_payment=True,
                    journal_entry_id=existing.journal_entry_id,
                )

        elif classification in (
            StatementLineClassification.BANK_FEE,
            StatementLineClassification.UNKNOWN,
        ):
            line.classification = classification
            line.status = StatementLineStatus.CLASSIFIED
            session.commit()
            session.refresh(line)
            return ClassifyStatementLineResult(
                line=_to_line_read(line),
                linked_existing_payment=False,
                journal_entry_id=None,
            )
        elif classification == StatementLineClassification.UNCLASSIFIED:
            raise InvalidClassificationError(
                "Cannot classify a line as unclassified — use a concrete classification"
            )
        else:
            raise InvalidClassificationError(f"Unsupported classification: {classification}")

    if classification != StatementLineClassification.SUPPLIER_PAYMENT:
        raise RuntimeError("unreachable")

    payment_amount = abs(line.amount_kurus)
    result = payables_posting.post_supplier_payment(
        session,
        entity_id,
        supplier_id,
        payment_date=line.transaction_date,
        amount_kurus=payment_amount,
        description=line.description,
        actor_id=actor_id,
        payment_account_id=money_account.gl_account_id,
        reference_type=BANK_STATEMENT_LINE_REF,
        reference_id=line.id,
    )
    journal_id = result.journal_entry.id
    supplier_ledger_id = result.supplier_ledger_entry.id

    with entity_context(session, entity_id):
        line = session.get(BankStatementLine, line_id)
        assert line is not None
        line.classification = StatementLineClassification.SUPPLIER_PAYMENT
        line.status = StatementLineStatus.POSTED
        line.supplier_id = supplier_id
        line.journal_entry_id = journal_id
        line.supplier_ledger_entry_id = supplier_ledger_id
        session.commit()
        session.refresh(line)

    return ClassifyStatementLineResult(
        line=_to_line_read(line),
        linked_existing_payment=False,
        journal_entry_id=journal_id,
    )
