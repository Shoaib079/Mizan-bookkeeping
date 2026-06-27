"""Bank statement import and line classification (Decisions §12)."""

from __future__ import annotations

import hashlib
import uuid
from datetime import date

from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.adapters.bank_parsers.dispatch import parse_bank_statement, resolve_statement_format
from app.adapters.bank_parsers.types import BankParseError
from app.adapters.storage.local import save_upload
from app.core.banking import posting as banking_posting
from app.core.banking import statement_posting
from app.core.banking.matching import NEAR_MATCH_DATE_WINDOW_DAYS, near_match_date_bounds
from app.core.receivables import posting as receivables_posting
from app.core.payables import posting as payables_posting
from app.core.pos import posting as pos_posting
from app.core.delivery import posting as delivery_posting
from app.core.expenses.posting import InvalidExpensePostingError, post_expense_entry
from app.features.delivery import platform_service
from app.features.delivery.platform_service import InactiveDeliveryPlatformError
from app.features.delivery.settings import (
    DeliveryNotEnabledError,
    require_delivery_enabled,
)
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
from app.features.banking.transfer_models import AccountTransfer
from app.features.delivery.models import DeliverySettlement
from app.features.pos.models import PosSettlement
from app.features.customers.models import Customer
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
        account_transfer_id=line.account_transfer_id,
        pos_settlement_id=line.pos_settlement_id,
        delivery_settlement_id=line.delivery_settlement_id,
        credit_card_payment_id=line.credit_card_payment_id,
        customer_id=line.customer_id,
        customer_ledger_entry_id=line.customer_ledger_entry_id,
        review_reason=line.review_reason,
        candidate_supplier_ledger_entry_id=line.candidate_supplier_ledger_entry_id,
        candidate_account_transfer_id=line.candidate_account_transfer_id,
        expense_entry_id=line.expense_entry_id,
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


def _used_supplier_ledger_entry_ids(
    session: Session, *, exclude_line_id: uuid.UUID | None = None
):
    query = select(BankStatementLine.supplier_ledger_entry_id).where(
        BankStatementLine.supplier_ledger_entry_id.isnot(None)
    )
    if exclude_line_id is not None:
        query = query.where(BankStatementLine.id != exclude_line_id)
    return query


def _find_matching_payment(
    session: Session,
    *,
    supplier_id: uuid.UUID,
    amount_kurus: int,
    transaction_date: date,
    exclude_line_id: uuid.UUID | None = None,
) -> SupplierLedgerEntry | None:
    payment_amount = abs(amount_kurus)
    used_entry_ids = _used_supplier_ledger_entry_ids(session, exclude_line_id=exclude_line_id)

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


def _find_near_matching_payments(
    session: Session,
    *,
    supplier_id: uuid.UUID,
    amount_kurus: int,
    transaction_date: date,
    exclude_line_id: uuid.UUID | None = None,
) -> list[SupplierLedgerEntry]:
    payment_amount = abs(amount_kurus)
    used_entry_ids = _used_supplier_ledger_entry_ids(session, exclude_line_id=exclude_line_id)
    low, high = near_match_date_bounds(transaction_date)

    return list(
        session.scalars(
            select(SupplierLedgerEntry)
            .where(
                SupplierLedgerEntry.supplier_id == supplier_id,
                SupplierLedgerEntry.movement_type == SupplierMovementType.PAYMENT,
                SupplierLedgerEntry.movement_date >= low,
                SupplierLedgerEntry.movement_date <= high,
                SupplierLedgerEntry.movement_date != transaction_date,
                SupplierLedgerEntry.amount_kurus == -payment_amount,
                SupplierLedgerEntry.id.not_in(used_entry_ids),
            )
            .order_by(SupplierLedgerEntry.movement_date, SupplierLedgerEntry.created_at)
        )
    )


def _link_payment_to_line(
    line: BankStatementLine,
    *,
    supplier_id: uuid.UUID,
    classification: StatementLineClassification,
    payment_entry: SupplierLedgerEntry,
) -> None:
    line.classification = classification
    line.status = StatementLineStatus.LINKED
    line.supplier_id = supplier_id
    line.journal_entry_id = payment_entry.journal_entry_id
    line.supplier_ledger_entry_id = payment_entry.id
    line.review_reason = None
    line.candidate_supplier_ledger_entry_id = None
    line.candidate_account_transfer_id = None


def _route_payment_needs_review(
    line: BankStatementLine,
    *,
    supplier_id: uuid.UUID,
    classification: StatementLineClassification,
    candidates: list[SupplierLedgerEntry],
) -> None:
    line.classification = classification
    line.status = StatementLineStatus.NEEDS_REVIEW
    line.supplier_id = supplier_id
    line.journal_entry_id = None
    line.supplier_ledger_entry_id = None
    if len(candidates) == 1:
        candidate = candidates[0]
        line.review_reason = (
            f"Near-match payment on {candidate.movement_date.isoformat()} "
            f"(statement date {line.transaction_date.isoformat()}, "
            f"window ±{NEAR_MATCH_DATE_WINDOW_DAYS} days)"
        )
        line.candidate_supplier_ledger_entry_id = candidate.id
    else:
        dates = ", ".join(c.movement_date.isoformat() for c in candidates)
        line.review_reason = (
            f"Multiple near-match payments within ±{NEAR_MATCH_DATE_WINDOW_DAYS} days "
            f"({dates}) — confirm which to link"
        )
        line.candidate_supplier_ledger_entry_id = None
    line.candidate_account_transfer_id = None


def _used_pos_settlement_ids(
    session: Session, *, exclude_line_id: uuid.UUID | None = None
) -> set[uuid.UUID]:
    query = select(BankStatementLine.pos_settlement_id).where(
        BankStatementLine.pos_settlement_id.isnot(None)
    )
    if exclude_line_id is not None:
        query = query.where(BankStatementLine.id != exclude_line_id)
    return set(session.scalars(query).all())


def _find_matching_pos_settlement(
    session: Session,
    *,
    money_account_id: uuid.UUID,
    amount_kurus: int,
    settlement_date: date,
    exclude_line_id: uuid.UUID | None = None,
) -> PosSettlement | None:
    used_ids = _used_pos_settlement_ids(session, exclude_line_id=exclude_line_id)
    filters = [
        PosSettlement.money_account_id == money_account_id,
        PosSettlement.settlement_date == settlement_date,
        PosSettlement.amount_kurus == amount_kurus,
    ]
    if used_ids:
        filters.append(PosSettlement.id.not_in(used_ids))
    return session.scalar(
        select(PosSettlement).where(*filters).order_by(PosSettlement.created_at).limit(1)
    )


def _link_pos_settlement_to_line(
    line: BankStatementLine, *, settlement: PosSettlement
) -> None:
    line.classification = StatementLineClassification.POS_SETTLEMENT
    line.status = StatementLineStatus.LINKED
    line.journal_entry_id = settlement.journal_entry_id
    line.pos_settlement_id = settlement.id
    line.review_reason = None


def _used_delivery_settlement_ids(
    session: Session, *, exclude_line_id: uuid.UUID | None = None
) -> set[uuid.UUID]:
    query = select(BankStatementLine.delivery_settlement_id).where(
        BankStatementLine.delivery_settlement_id.isnot(None)
    )
    if exclude_line_id is not None:
        query = query.where(BankStatementLine.id != exclude_line_id)
    return set(session.scalars(query).all())


def _find_matching_delivery_settlement(
    session: Session,
    *,
    delivery_platform_id: uuid.UUID,
    money_account_id: uuid.UUID,
    amount_kurus: int,
    settlement_date: date,
    exclude_line_id: uuid.UUID | None = None,
) -> DeliverySettlement | None:
    used_ids = _used_delivery_settlement_ids(session, exclude_line_id=exclude_line_id)
    filters = [
        DeliverySettlement.delivery_platform_id == delivery_platform_id,
        DeliverySettlement.money_account_id == money_account_id,
        DeliverySettlement.settlement_date == settlement_date,
        DeliverySettlement.amount_kurus == amount_kurus,
    ]
    if used_ids:
        filters.append(DeliverySettlement.id.not_in(used_ids))
    return session.scalar(
        select(DeliverySettlement)
        .where(*filters)
        .order_by(DeliverySettlement.created_at)
        .limit(1)
    )


def _link_delivery_settlement_to_line(
    line: BankStatementLine, *, settlement: DeliverySettlement
) -> None:
    line.classification = StatementLineClassification.DELIVERY_SETTLEMENT
    line.status = StatementLineStatus.LINKED
    line.journal_entry_id = settlement.journal_entry_id
    line.delivery_settlement_id = settlement.id
    line.review_reason = None


def _find_matching_transfer(
    session: Session,
    *,
    to_money_account_id: uuid.UUID,
    amount_kurus: int,
    transfer_date: date,
    from_money_account_id: uuid.UUID | None = None,
    exclude_line_id: uuid.UUID | None = None,
) -> AccountTransfer | None:
    """Find an outflow-posted transfer awaiting inflow link on the destination account."""
    query = select(AccountTransfer).where(
        AccountTransfer.to_money_account_id == to_money_account_id,
        AccountTransfer.amount_kurus == amount_kurus,
        AccountTransfer.transfer_date == transfer_date,
        AccountTransfer.to_statement_line_id.is_(None),
        AccountTransfer.from_statement_line_id.isnot(None),
    )
    if from_money_account_id is not None:
        query = query.where(AccountTransfer.from_money_account_id == from_money_account_id)
    if exclude_line_id is not None:
        query = query.where(AccountTransfer.from_statement_line_id != exclude_line_id)
    return session.scalar(query.order_by(AccountTransfer.created_at).limit(1))


def _find_near_matching_transfers(
    session: Session,
    *,
    to_money_account_id: uuid.UUID,
    amount_kurus: int,
    transfer_date: date,
    from_money_account_id: uuid.UUID | None = None,
    exclude_line_id: uuid.UUID | None = None,
) -> list[AccountTransfer]:
    low, high = near_match_date_bounds(transfer_date)
    query = select(AccountTransfer).where(
        AccountTransfer.to_money_account_id == to_money_account_id,
        AccountTransfer.amount_kurus == amount_kurus,
        AccountTransfer.transfer_date >= low,
        AccountTransfer.transfer_date <= high,
        AccountTransfer.transfer_date != transfer_date,
        AccountTransfer.to_statement_line_id.is_(None),
        AccountTransfer.from_statement_line_id.isnot(None),
    )
    if from_money_account_id is not None:
        query = query.where(AccountTransfer.from_money_account_id == from_money_account_id)
    if exclude_line_id is not None:
        query = query.where(AccountTransfer.from_statement_line_id != exclude_line_id)
    return list(session.scalars(query.order_by(AccountTransfer.transfer_date, AccountTransfer.created_at)))


def _find_near_matching_outflow_transfers(
    session: Session,
    *,
    from_money_account_id: uuid.UUID,
    amount_kurus: int,
    transfer_date: date,
    to_money_account_id: uuid.UUID | None = None,
    exclude_line_id: uuid.UUID | None = None,
) -> list[AccountTransfer]:
    """Manual or unlinked transfers that may match a statement outflow on a nearby date."""
    low, high = near_match_date_bounds(transfer_date)
    query = select(AccountTransfer).where(
        AccountTransfer.from_money_account_id == from_money_account_id,
        AccountTransfer.amount_kurus == amount_kurus,
        AccountTransfer.transfer_date >= low,
        AccountTransfer.transfer_date <= high,
        AccountTransfer.transfer_date != transfer_date,
        AccountTransfer.from_statement_line_id.is_(None),
    )
    if to_money_account_id is not None:
        query = query.where(AccountTransfer.to_money_account_id == to_money_account_id)
    if exclude_line_id is not None:
        query = query.where(
            (AccountTransfer.from_statement_line_id.is_(None))
            | (AccountTransfer.from_statement_line_id != exclude_line_id)
        )
    return list(session.scalars(query.order_by(AccountTransfer.transfer_date, AccountTransfer.created_at)))


def _link_transfer_to_line(
    line: BankStatementLine,
    *,
    transfer: AccountTransfer,
    as_inflow: bool,
) -> None:
    line.classification = StatementLineClassification.TRANSFER
    line.status = StatementLineStatus.LINKED
    line.journal_entry_id = transfer.journal_entry_id
    line.account_transfer_id = transfer.id
    line.review_reason = None
    line.candidate_supplier_ledger_entry_id = None
    line.candidate_account_transfer_id = None
    if as_inflow:
        transfer.to_statement_line_id = line.id
    else:
        transfer.from_statement_line_id = line.id


def _route_transfer_needs_review(
    line: BankStatementLine,
    *,
    candidates: list[AccountTransfer],
    as_inflow: bool,
) -> None:
    line.classification = StatementLineClassification.TRANSFER
    line.status = StatementLineStatus.NEEDS_REVIEW
    line.journal_entry_id = None
    line.account_transfer_id = None
    if len(candidates) == 1:
        candidate = candidates[0]
        line.review_reason = (
            f"Near-match transfer on {candidate.transfer_date.isoformat()} "
            f"(statement date {line.transaction_date.isoformat()}, "
            f"window ±{NEAR_MATCH_DATE_WINDOW_DAYS} days)"
        )
        line.candidate_account_transfer_id = candidate.id
    else:
        dates = ", ".join(c.transfer_date.isoformat() for c in candidates)
        line.review_reason = (
            f"Multiple near-match transfers within ±{NEAR_MATCH_DATE_WINDOW_DAYS} days "
            f"({dates}) — confirm which to link"
        )
        line.candidate_account_transfer_id = None
    line.candidate_supplier_ledger_entry_id = None


def import_bank_statement(
    session: Session,
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    content: bytes,
    *,
    original_filename: str,
    content_type: str | None = None,
) -> BankStatementRead:
    """Parse CSV/Excel, store file, create statement + lines. Rejects duplicates and overlaps."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    fingerprint = file_fingerprint(content)
    try:
        parsed = parse_bank_statement(
            content,
            original_filename=original_filename,
            content_type=content_type,
        )
    except BankParseError as exc:
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
            extension=resolve_statement_format(
                original_filename=original_filename,
                content_type=content_type,
            ),
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
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[BankStatementRead], int]:
    from app.core.listing import ListParams, date_range_filters, fetch_paginated

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        _get_bank_money_account(session, money_account_id)
        filters = [BankStatement.money_account_id == money_account_id]
        filters.extend(
            date_range_filters(
                BankStatement.period_start, from_date=from_date, to_date=to_date
            )
        )
        stmt = (
            select(BankStatement)
            .where(*filters)
            .order_by(BankStatement.imported_at.desc())
        )
        statements, total = fetch_paginated(session, stmt, params)
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
        return results, total


def classify_statement_line(
    session: Session,
    entity_id: uuid.UUID,
    statement_id: uuid.UUID,
    line_id: uuid.UUID,
    *,
    classification: StatementLineClassification,
    supplier_id: uuid.UUID | None = None,
    customer_id: uuid.UUID | None = None,
    counterpart_money_account_id: uuid.UUID | None = None,
    credit_card_money_account_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
    confirm_supplier_ledger_entry_id: uuid.UUID | None = None,
    confirm_account_transfer_id: uuid.UUID | None = None,
    delivery_platform_id: uuid.UUID | None = None,
    expense_account_id: uuid.UUID | None = None,
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

        if line.status == StatementLineStatus.NEEDS_REVIEW:
            if confirm_supplier_ledger_entry_id is not None:
                payment_entry = session.get(
                    SupplierLedgerEntry, confirm_supplier_ledger_entry_id
                )
                if payment_entry is None:
                    raise LookupError("Supplier ledger entry not found")
                if (
                    line.candidate_supplier_ledger_entry_id is not None
                    and payment_entry.id != line.candidate_supplier_ledger_entry_id
                ):
                    raise InvalidClassificationError(
                        "confirm_supplier_ledger_entry_id does not match review candidate"
                    )
                _link_payment_to_line(
                    line,
                    supplier_id=payment_entry.supplier_id,
                    classification=StatementLineClassification.SUPPLIER_PAYMENT,
                    payment_entry=payment_entry,
                )
                session.commit()
                session.refresh(line)
                return ClassifyStatementLineResult(
                    line=_to_line_read(line),
                    linked_existing_payment=True,
                    linked_existing_transfer=False,
                    routed_to_needs_review=False,
                    journal_entry_id=payment_entry.journal_entry_id,
                )
            if confirm_account_transfer_id is not None:
                transfer = session.get(AccountTransfer, confirm_account_transfer_id)
                if transfer is None:
                    raise LookupError("Account transfer not found")
                if (
                    line.candidate_account_transfer_id is not None
                    and transfer.id != line.candidate_account_transfer_id
                ):
                    raise InvalidClassificationError(
                        "confirm_account_transfer_id does not match review candidate"
                    )
                as_inflow = line.amount_kurus > 0
                _link_transfer_to_line(line, transfer=transfer, as_inflow=as_inflow)
                session.commit()
                session.refresh(line)
                return ClassifyStatementLineResult(
                    line=_to_line_read(line),
                    linked_existing_payment=False,
                    linked_existing_transfer=True,
                    routed_to_needs_review=False,
                    journal_entry_id=transfer.journal_entry_id,
                )
            raise InvalidClassificationError(
                "needs_review line requires confirm_supplier_ledger_entry_id or "
                "confirm_account_transfer_id to complete linking"
            )

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
                _link_payment_to_line(
                    line,
                    supplier_id=supplier_id,
                    classification=classification,
                    payment_entry=existing,
                )
                session.commit()
                session.refresh(line)
                return ClassifyStatementLineResult(
                    line=_to_line_read(line),
                    linked_existing_payment=True,
                    linked_existing_transfer=False,
                    routed_to_needs_review=False,
                    journal_entry_id=existing.journal_entry_id,
                )

            near_matches = _find_near_matching_payments(
                session,
                supplier_id=supplier_id,
                amount_kurus=line.amount_kurus,
                transaction_date=line.transaction_date,
                exclude_line_id=line.id,
            )
            if near_matches:
                _route_payment_needs_review(
                    line,
                    supplier_id=supplier_id,
                    classification=classification,
                    candidates=near_matches,
                )
                session.commit()
                session.refresh(line)
                return ClassifyStatementLineResult(
                    line=_to_line_read(line),
                    linked_existing_payment=False,
                    linked_existing_transfer=False,
                    routed_to_needs_review=True,
                    journal_entry_id=None,
                )

        elif classification == StatementLineClassification.TRANSFER:
            transfer_amount = abs(line.amount_kurus)
            if line.amount_kurus < 0:
                if counterpart_money_account_id is None or actor_id is None:
                    raise InvalidClassificationError(
                        "counterpart_money_account_id and actor_id are required "
                        "for transfer outflow"
                    )
                counterpart = session.get(MoneyAccount, counterpart_money_account_id)
                if counterpart is None:
                    raise LookupError("Counterpart money account not found")

                near_outflows = _find_near_matching_outflow_transfers(
                    session,
                    from_money_account_id=statement.money_account_id,
                    amount_kurus=transfer_amount,
                    transfer_date=line.transaction_date,
                    to_money_account_id=counterpart_money_account_id,
                    exclude_line_id=line.id,
                )
                if near_outflows:
                    _route_transfer_needs_review(
                        line, candidates=near_outflows, as_inflow=False
                    )
                    session.commit()
                    session.refresh(line)
                    return ClassifyStatementLineResult(
                        line=_to_line_read(line),
                        linked_existing_payment=False,
                        linked_existing_transfer=False,
                        routed_to_needs_review=True,
                        journal_entry_id=None,
                    )
            else:
                existing_transfer = _find_matching_transfer(
                    session,
                    to_money_account_id=statement.money_account_id,
                    amount_kurus=transfer_amount,
                    transfer_date=line.transaction_date,
                    from_money_account_id=counterpart_money_account_id,
                    exclude_line_id=line.id,
                )
                if existing_transfer is not None:
                    _link_transfer_to_line(
                        line, transfer=existing_transfer, as_inflow=True
                    )
                    session.commit()
                    session.refresh(line)
                    return ClassifyStatementLineResult(
                        line=_to_line_read(line),
                        linked_existing_payment=False,
                        linked_existing_transfer=True,
                        routed_to_needs_review=False,
                        journal_entry_id=existing_transfer.journal_entry_id,
                    )

                near_inflows = _find_near_matching_transfers(
                    session,
                    to_money_account_id=statement.money_account_id,
                    amount_kurus=transfer_amount,
                    transfer_date=line.transaction_date,
                    from_money_account_id=counterpart_money_account_id,
                    exclude_line_id=line.id,
                )
                if near_inflows:
                    _route_transfer_needs_review(
                        line, candidates=near_inflows, as_inflow=True
                    )
                    session.commit()
                    session.refresh(line)
                    return ClassifyStatementLineResult(
                        line=_to_line_read(line),
                        linked_existing_payment=False,
                        linked_existing_transfer=False,
                        routed_to_needs_review=True,
                        journal_entry_id=None,
                    )

                if counterpart_money_account_id is None or actor_id is None:
                    raise InvalidClassificationError(
                        "counterpart_money_account_id and actor_id are required "
                        "for transfer inflow when no matching outflow transfer exists"
                    )
                counterpart = session.get(MoneyAccount, counterpart_money_account_id)
                if counterpart is None:
                    raise LookupError("Counterpart money account not found")

        elif classification == StatementLineClassification.POS_SETTLEMENT:
            if line.amount_kurus <= 0:
                raise InvalidClassificationError(
                    "pos_settlement classification requires an inflow (positive amount_kurus)"
                )
            if actor_id is None:
                raise InvalidClassificationError(
                    "actor_id is required for pos_settlement"
                )
            existing_settlement = _find_matching_pos_settlement(
                session,
                money_account_id=statement.money_account_id,
                amount_kurus=line.amount_kurus,
                settlement_date=line.transaction_date,
                exclude_line_id=line.id,
            )
            if existing_settlement is not None:
                _link_pos_settlement_to_line(line, settlement=existing_settlement)
                session.commit()
                session.refresh(line)
                return ClassifyStatementLineResult(
                    line=_to_line_read(line),
                    linked_existing_payment=False,
                    linked_existing_transfer=False,
                    linked_existing_settlement=True,
                    routed_to_needs_review=False,
                    journal_entry_id=existing_settlement.journal_entry_id,
                )

        elif classification == StatementLineClassification.DELIVERY_SETTLEMENT:
            if line.amount_kurus <= 0:
                raise InvalidClassificationError(
                    "delivery_settlement classification requires an inflow "
                    "(positive amount_kurus)"
                )
            if actor_id is None:
                raise InvalidClassificationError(
                    "actor_id is required for delivery_settlement"
                )
            if delivery_platform_id is None:
                raise InvalidClassificationError(
                    "delivery_platform_id is required for delivery_settlement"
                )
            try:
                require_delivery_enabled(session, entity_id)
                platform_service.get_delivery_platform_row(
                    session, entity_id, delivery_platform_id
                )
            except (DeliveryNotEnabledError, LookupError) as exc:
                raise InvalidClassificationError(str(exc)) from exc
            except InactiveDeliveryPlatformError as exc:
                raise InvalidClassificationError(str(exc)) from exc
            existing_settlement = _find_matching_delivery_settlement(
                session,
                delivery_platform_id=delivery_platform_id,
                money_account_id=statement.money_account_id,
                amount_kurus=line.amount_kurus,
                settlement_date=line.transaction_date,
                exclude_line_id=line.id,
            )
            if existing_settlement is not None:
                _link_delivery_settlement_to_line(line, settlement=existing_settlement)
                session.commit()
                session.refresh(line)
                return ClassifyStatementLineResult(
                    line=_to_line_read(line),
                    linked_existing_payment=False,
                    linked_existing_transfer=False,
                    linked_existing_settlement=True,
                    routed_to_needs_review=False,
                    journal_entry_id=existing_settlement.journal_entry_id,
                )

        elif classification == StatementLineClassification.BANK_FEE:
            if line.amount_kurus >= 0:
                raise InvalidClassificationError(
                    "bank_fee classification requires an outflow (negative amount_kurus)"
                )
            if actor_id is None:
                raise InvalidClassificationError("actor_id is required for bank_fee")

        elif classification == StatementLineClassification.RENT_UTILITY:
            if line.amount_kurus >= 0:
                raise InvalidClassificationError(
                    "rent_utility classification requires an outflow (negative amount_kurus)"
                )
            if actor_id is None:
                raise InvalidClassificationError("actor_id is required for rent_utility")
            if expense_account_id is None:
                raise InvalidClassificationError(
                    "expense_account_id is required for rent_utility"
                )

        elif classification == StatementLineClassification.CREDIT_CARD_PAYMENT:
            if line.amount_kurus >= 0:
                raise InvalidClassificationError(
                    "credit_card_payment classification requires an outflow "
                    "(negative amount_kurus)"
                )
            if credit_card_money_account_id is None or actor_id is None:
                raise InvalidClassificationError(
                    "credit_card_money_account_id and actor_id are required "
                    "for credit_card_payment"
                )
            card_account = session.get(MoneyAccount, credit_card_money_account_id)
            if card_account is None:
                raise LookupError("Credit card money account not found")
            if card_account.account_kind != MoneyAccountKind.CREDIT_CARD:
                raise InvalidClassificationError(
                    "credit_card_payment requires a credit_card money account"
                )

        elif classification == StatementLineClassification.CUSTOMER_PAYMENT:
            if line.amount_kurus <= 0:
                raise InvalidClassificationError(
                    "customer_payment classification requires an inflow (positive amount_kurus)"
                )
            if customer_id is None or actor_id is None:
                raise InvalidClassificationError(
                    "customer_id and actor_id are required for customer_payment"
                )
            customer = session.get(Customer, customer_id)
            if customer is None:
                raise LookupError("Customer not found")

        elif classification == StatementLineClassification.UNKNOWN:
            line.classification = classification
            line.status = StatementLineStatus.CLASSIFIED
            session.commit()
            session.refresh(line)
            return ClassifyStatementLineResult(
                line=_to_line_read(line),
                linked_existing_payment=False,
                linked_existing_transfer=False,
                routed_to_needs_review=False,
                journal_entry_id=None,
            )
        elif classification == StatementLineClassification.UNCLASSIFIED:
            raise InvalidClassificationError(
                "Cannot classify a line as unclassified — use a concrete classification"
            )
        else:
            raise InvalidClassificationError(f"Unsupported classification: {classification}")

    if classification == StatementLineClassification.SUPPLIER_PAYMENT:
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
            linked_existing_transfer=False,
            routed_to_needs_review=False,
            journal_entry_id=journal_id,
        )

    if classification == StatementLineClassification.CUSTOMER_PAYMENT:
        payment_amount = line.amount_kurus
        assert customer_id is not None
        assert actor_id is not None
        result = receivables_posting.post_customer_payment(
            session,
            entity_id,
            customer_id,
            payment_date=line.transaction_date,
            amount_kurus=payment_amount,
            description=line.description,
            actor_id=actor_id,
            payment_account_id=money_account.gl_account_id,
            reference_type=BANK_STATEMENT_LINE_REF,
            reference_id=line.id,
        )
        journal_id = result.journal_entry.id
        customer_ledger_id = result.customer_ledger_entry.id

        with entity_context(session, entity_id):
            line = session.get(BankStatementLine, line_id)
            assert line is not None
            line.classification = StatementLineClassification.CUSTOMER_PAYMENT
            line.status = StatementLineStatus.POSTED
            line.customer_id = customer_id
            line.journal_entry_id = journal_id
            line.customer_ledger_entry_id = customer_ledger_id
            session.commit()
            session.refresh(line)

        return ClassifyStatementLineResult(
            line=_to_line_read(line),
            linked_existing_payment=False,
            linked_existing_transfer=False,
            routed_to_needs_review=False,
            journal_entry_id=journal_id,
        )

    if classification == StatementLineClassification.POS_SETTLEMENT:
        settlement_amount = line.amount_kurus
        assert actor_id is not None
        result = pos_posting.post_pos_settlement(
            session,
            entity_id,
            money_account_id=statement.money_account_id,
            settlement_date=line.transaction_date,
            amount_kurus=settlement_amount,
            description=line.description,
            actor_id=actor_id,
            reference_type=BANK_STATEMENT_LINE_REF,
            reference_id=line.id,
            bank_statement_line_id=line.id,
        )
        journal_id = result.journal_entry.id
        settlement_id = result.pos_settlement.id

        with entity_context(session, entity_id):
            line = session.get(BankStatementLine, line_id)
            assert line is not None
            line.classification = StatementLineClassification.POS_SETTLEMENT
            line.status = StatementLineStatus.POSTED
            line.journal_entry_id = journal_id
            line.pos_settlement_id = settlement_id
            session.commit()
            session.refresh(line)

        return ClassifyStatementLineResult(
            line=_to_line_read(line),
            linked_existing_payment=False,
            linked_existing_transfer=False,
            linked_existing_settlement=False,
            routed_to_needs_review=False,
            journal_entry_id=journal_id,
        )

    if classification == StatementLineClassification.DELIVERY_SETTLEMENT:
        settlement_amount = line.amount_kurus
        assert actor_id is not None
        assert delivery_platform_id is not None
        result = delivery_posting.post_delivery_settlement(
            session,
            entity_id,
            delivery_platform_id=delivery_platform_id,
            money_account_id=statement.money_account_id,
            settlement_date=line.transaction_date,
            amount_kurus=settlement_amount,
            description=line.description,
            actor_id=actor_id,
            reference_type=BANK_STATEMENT_LINE_REF,
            reference_id=line.id,
            bank_statement_line_id=line.id,
        )
        journal_id = result.journal_entry.id
        settlement_id = result.delivery_settlement.id

        with entity_context(session, entity_id):
            line = session.get(BankStatementLine, line_id)
            assert line is not None
            line.classification = StatementLineClassification.DELIVERY_SETTLEMENT
            line.status = StatementLineStatus.POSTED
            line.journal_entry_id = journal_id
            line.delivery_settlement_id = settlement_id
            session.commit()
            session.refresh(line)

        return ClassifyStatementLineResult(
            line=_to_line_read(line),
            linked_existing_payment=False,
            linked_existing_transfer=False,
            routed_to_needs_review=False,
            journal_entry_id=journal_id,
        )

    if classification == StatementLineClassification.BANK_FEE:
        fee_amount = abs(line.amount_kurus)
        assert actor_id is not None
        result = statement_posting.post_bank_fee(
            session,
            entity_id,
            bank_money_account_id=statement.money_account_id,
            fee_date=line.transaction_date,
            amount_kurus=fee_amount,
            description=line.description,
            actor_id=actor_id,
        )
        journal_id = result.journal_entry.id

        with entity_context(session, entity_id):
            line = session.get(BankStatementLine, line_id)
            assert line is not None
            line.classification = StatementLineClassification.BANK_FEE
            line.status = StatementLineStatus.POSTED
            line.journal_entry_id = journal_id
            session.commit()
            session.refresh(line)

        return ClassifyStatementLineResult(
            line=_to_line_read(line),
            linked_existing_payment=False,
            linked_existing_transfer=False,
            routed_to_needs_review=False,
            journal_entry_id=journal_id,
        )

    if classification == StatementLineClassification.CREDIT_CARD_PAYMENT:
        payment_amount = abs(line.amount_kurus)
        assert actor_id is not None
        assert credit_card_money_account_id is not None
        result = statement_posting.post_credit_card_payment(
            session,
            entity_id,
            credit_card_money_account_id=credit_card_money_account_id,
            bank_money_account_id=statement.money_account_id,
            payment_date=line.transaction_date,
            amount_kurus=payment_amount,
            description=line.description,
            actor_id=actor_id,
            bank_statement_line_id=line.id,
        )
        journal_id = result.journal_entry.id
        payment_id = result.credit_card_payment.id

        with entity_context(session, entity_id):
            line = session.get(BankStatementLine, line_id)
            assert line is not None
            line.classification = StatementLineClassification.CREDIT_CARD_PAYMENT
            line.status = StatementLineStatus.POSTED
            line.journal_entry_id = journal_id
            line.credit_card_payment_id = payment_id
            session.commit()
            session.refresh(line)

        return ClassifyStatementLineResult(
            line=_to_line_read(line),
            linked_existing_payment=False,
            linked_existing_transfer=False,
            routed_to_needs_review=False,
            journal_entry_id=journal_id,
        )

    if classification == StatementLineClassification.RENT_UTILITY:
        expense_amount = abs(line.amount_kurus)
        assert actor_id is not None
        assert expense_account_id is not None
        try:
            result = post_expense_entry(
                session,
                entity_id,
                expense_date=line.transaction_date,
                amount_kurus=expense_amount,
                expense_account_id=expense_account_id,
                money_account_id=statement.money_account_id,
                description=line.description,
                actor_id=actor_id,
                bank_statement_line_id=line.id,
            )
        except (InvalidExpensePostingError, ValueError) as exc:
            raise InvalidClassificationError(str(exc)) from exc

        journal_id = result.journal_entry.id
        expense_id = result.expense_entry.id

        with entity_context(session, entity_id):
            line = session.get(BankStatementLine, line_id)
            assert line is not None
            line.classification = StatementLineClassification.RENT_UTILITY
            line.status = StatementLineStatus.POSTED
            line.journal_entry_id = journal_id
            line.expense_entry_id = expense_id
            session.commit()
            session.refresh(line)

        return ClassifyStatementLineResult(
            line=_to_line_read(line),
            linked_existing_payment=False,
            linked_existing_transfer=False,
            routed_to_needs_review=False,
            journal_entry_id=journal_id,
        )

    if classification != StatementLineClassification.TRANSFER:
        raise RuntimeError("unreachable")

    transfer_amount = abs(line.amount_kurus)
    if line.amount_kurus < 0:
        from_money_account_id = statement.money_account_id
        to_money_account_id = counterpart_money_account_id
        from_line_id = line.id
        to_line_id = None
    else:
        from_money_account_id = counterpart_money_account_id
        to_money_account_id = statement.money_account_id
        from_line_id = None
        to_line_id = line.id

    assert from_money_account_id is not None
    assert to_money_account_id is not None
    assert actor_id is not None

    result = banking_posting.post_account_transfer(
        session,
        entity_id,
        from_money_account_id=from_money_account_id,
        to_money_account_id=to_money_account_id,
        transfer_date=line.transaction_date,
        amount_kurus=transfer_amount,
        description=line.description,
        actor_id=actor_id,
        from_statement_line_id=from_line_id,
        to_statement_line_id=to_line_id,
    )
    journal_id = result.journal_entry.id
    transfer_id = result.account_transfer.id

    with entity_context(session, entity_id):
        line = session.get(BankStatementLine, line_id)
        assert line is not None
        line.classification = StatementLineClassification.TRANSFER
        line.status = StatementLineStatus.POSTED
        line.journal_entry_id = journal_id
        line.account_transfer_id = transfer_id
        session.commit()
        session.refresh(line)

    return ClassifyStatementLineResult(
        line=_to_line_read(line),
        linked_existing_payment=False,
        linked_existing_transfer=False,
        routed_to_needs_review=False,
        journal_entry_id=journal_id,
    )
