"""Record payment bounced pairs on bank statements (supplier / staff / partner)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.banking.statement_posting import (
    build_bank_fee_posting_lines,
    _validate_bank_gl_account,
    _validate_bank_money_account,
)
from app.core.chart_of_accounts.default_chart import BANK_CHARGES_CODE
from app.core.chart_of_accounts.models import Account
from app.core.ledger.models import JournalEntrySource
from app.core.ledger.posting import prepare_journal_entry
from app.core.ledger.models import JournalEntry, JournalEntryStatus
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import StaffMovementType
from app.features.partners.models import Partner
from app.features.staff.models import Employee
from app.features.suppliers.models import Supplier
from app.db.session import entity_context, require_entity_context
from app.features.banking.schema import (
    BankStatementLineRead,
    StatementBouncePairRead,
    StatementBouncePairResult,
)
from app.features.banking.statement_classify_core import _to_line_read
from app.features.banking.statement_models import (
    BankStatement,
    BankStatementLine,
    BouncePersonType,
    StatementBouncePair,
    StatementLineClassification,
    StatementLineStatus,
)
from app.features.entities import service as entity_service

_STAFF_OUTFLOW_TYPES = frozenset(
    {
        StaffMovementType.SALARY_PAYMENT,
        StaffMovementType.ADVANCE_PAID,
        StaffMovementType.INCENTIVE_PAID,
    }
)

_PARTNER_OUTFLOW_TYPES = frozenset(
    {
        PartnerMovementType.REIMBURSEMENT_PAID,
        PartnerMovementType.DRAWING,
        PartnerMovementType.PROFIT_PAID,
        PartnerMovementType.PARTNER_LOAN_REPAID,
    }
)


class BouncePairError(ValueError):
    """Invalid bounce pair request."""


def _get_line(
    session: Session,
    statement_id: uuid.UUID,
    line_id: uuid.UUID,
    *,
    label: str,
) -> BankStatementLine:
    line = session.get(BankStatementLine, line_id)
    if line is None or line.statement_id != statement_id:
        raise BouncePairError(f"{label} not found on this statement")
    return line


def _assert_bounceable(line: BankStatementLine, *, label: str) -> None:
    if line.bounce_pair_id is not None:
        raise BouncePairError(f"{label} is already part of a bounce pair")
    if line.status not in (
        StatementLineStatus.IMPORTED,
        StatementLineStatus.NEEDS_REVIEW,
    ):
        raise BouncePairError(f"{label} is already settled — cannot bounce")
    if line.journal_entry_id is not None:
        raise BouncePairError(f"{label} already has a ledger entry")


def _set_person_on_line(
    line: BankStatementLine,
    *,
    person_type: BouncePersonType,
    person_id: uuid.UUID,
) -> None:
    line.supplier_id = None
    line.employee_id = None
    line.partner_id = None
    if person_type == BouncePersonType.SUPPLIER:
        line.supplier_id = person_id
    elif person_type == BouncePersonType.STAFF:
        line.employee_id = person_id
    else:
        line.partner_id = person_id


def _assert_person_exists(
    session: Session,
    entity_id: uuid.UUID,
    *,
    person_type: BouncePersonType,
    person_id: uuid.UUID,
) -> None:
    if person_type == BouncePersonType.SUPPLIER:
        supplier = session.get(Supplier, person_id)
        if supplier is None or supplier.entity_id != entity_id:
            raise BouncePairError("Supplier not found")
        return
    if person_type == BouncePersonType.STAFF:
        employee = session.get(Employee, person_id)
        if employee is None or employee.entity_id != entity_id:
            raise BouncePairError("Employee not found")
        return
    partner = session.get(Partner, person_id)
    if partner is None or partner.entity_id != entity_id:
        raise BouncePairError("Partner not found")


def _active_supplier_payment(
    session: Session,
    *,
    supplier_id: uuid.UUID,
    amount_kurus: int,
    payment_date: date,
) -> SupplierLedgerEntry | None:
    return session.scalar(
        select(SupplierLedgerEntry)
        .join(JournalEntry, SupplierLedgerEntry.journal_entry_id == JournalEntry.id)
        .where(
            JournalEntry.status == JournalEntryStatus.POSTED,
            SupplierLedgerEntry.supplier_id == supplier_id,
            SupplierLedgerEntry.movement_type == SupplierMovementType.PAYMENT,
            SupplierLedgerEntry.movement_date == payment_date,
            SupplierLedgerEntry.amount_kurus == -amount_kurus,
        )
        .limit(1)
    )


def _active_staff_payment(
    session: Session,
    *,
    employee_id: uuid.UUID,
    amount_kurus: int,
    payment_date: date,
) -> StaffLedgerEntry | None:
    return session.scalar(
        select(StaffLedgerEntry)
        .join(JournalEntry, StaffLedgerEntry.journal_entry_id == JournalEntry.id)
        .where(
            JournalEntry.status == JournalEntryStatus.POSTED,
            StaffLedgerEntry.employee_id == employee_id,
            StaffLedgerEntry.movement_type.in_(_STAFF_OUTFLOW_TYPES),
            StaffLedgerEntry.movement_date == payment_date,
            StaffLedgerEntry.amount_kurus == -amount_kurus,
        )
        .limit(1)
    )


def _active_partner_payment(
    session: Session,
    *,
    partner_id: uuid.UUID,
    amount_kurus: int,
    payment_date: date,
) -> PartnerLedgerEntry | None:
    return session.scalar(
        select(PartnerLedgerEntry)
        .join(JournalEntry, PartnerLedgerEntry.journal_entry_id == JournalEntry.id)
        .where(
            JournalEntry.status == JournalEntryStatus.POSTED,
            PartnerLedgerEntry.partner_id == partner_id,
            PartnerLedgerEntry.movement_type.in_(_PARTNER_OUTFLOW_TYPES),
            PartnerLedgerEntry.movement_date == payment_date,
            PartnerLedgerEntry.amount_kurus == -amount_kurus,
        )
        .limit(1)
    )


def _find_active_payment_journal(
    session: Session,
    *,
    person_type: BouncePersonType,
    person_id: uuid.UUID,
    amount_kurus: int,
    payment_date: date,
) -> uuid.UUID | None:
    if person_type == BouncePersonType.SUPPLIER:
        row = _active_supplier_payment(
            session,
            supplier_id=person_id,
            amount_kurus=amount_kurus,
            payment_date=payment_date,
        )
    elif person_type == BouncePersonType.STAFF:
        row = _active_staff_payment(
            session,
            employee_id=person_id,
            amount_kurus=amount_kurus,
            payment_date=payment_date,
        )
    else:
        row = _active_partner_payment(
            session,
            partner_id=person_id,
            amount_kurus=amount_kurus,
            payment_date=payment_date,
        )
    return row.journal_entry_id if row is not None else None


def _mark_bounced_line(
    line: BankStatementLine,
    *,
    person_type: BouncePersonType,
    person_id: uuid.UUID,
    bounce_pair_id: uuid.UUID,
) -> None:
    line.classification = StatementLineClassification.PAYMENT_BOUNCED
    line.status = StatementLineStatus.CLASSIFIED
    line.journal_entry_id = None
    line.review_reason = None
    line.candidate_supplier_ledger_entry_id = None
    line.candidate_account_transfer_id = None
    line.bounce_pair_id = bounce_pair_id
    _set_person_on_line(line, person_type=person_type, person_id=person_id)


def _post_fee_line(
    session: Session,
    entity_id: uuid.UUID,
    statement: BankStatement,
    fee_line: BankStatementLine,
    *,
    actor_id: uuid.UUID,
) -> uuid.UUID:
    fee_amount = abs(fee_line.amount_kurus)
    bank_account = _validate_bank_money_account(
        session, entity_id, statement.money_account_id
    )
    _validate_bank_gl_account(session, entity_id, bank_account.gl_account_id)
    bank_charges = session.scalar(
        select(Account).where(Account.code == BANK_CHARGES_CODE)
    )
    if bank_charges is None:
        raise BouncePairError("Bank charges account not found")

    lines = build_bank_fee_posting_lines(
        bank_gl_account_id=bank_account.gl_account_id,
        bank_charges_account_id=bank_charges.id,
        amount_kurus=fee_amount,
    )
    journal_entry = prepare_journal_entry(
        session,
        entity_id,
        fee_line.transaction_date,
        fee_line.description,
        lines,
        actor_id=actor_id,
        source=JournalEntrySource.BANK_FEE,
    )
    journal_id = journal_entry.id
    fee_line.classification = StatementLineClassification.BANK_FEE
    fee_line.status = StatementLineStatus.POSTED
    fee_line.journal_entry_id = journal_id
    fee_line.review_reason = None
    return journal_id


def record_payment_bounce(
    session: Session,
    entity_id: uuid.UUID,
    statement_id: uuid.UUID,
    *,
    outflow_line_id: uuid.UUID,
    return_line_id: uuid.UUID,
    person_type: BouncePersonType,
    person_id: uuid.UUID,
    fee_line_id: uuid.UUID | None,
    actor_id: uuid.UUID,
    reason: str | None = None,
) -> StatementBouncePairResult:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        statement = session.get(BankStatement, statement_id)
        if statement is None or statement.entity_id != entity_id:
            raise LookupError("Statement not found")

        outflow = _get_line(session, statement_id, outflow_line_id, label="Outflow line")
        return_line = _get_line(session, statement_id, return_line_id, label="Return line")
        fee = (
            _get_line(session, statement_id, fee_line_id, label="Fee line")
            if fee_line_id is not None
            else None
        )

        if outflow.id == return_line.id:
            raise BouncePairError("Outflow and return must be different lines")
        if fee is not None and fee.id in {outflow.id, return_line.id}:
            raise BouncePairError("Fee line must differ from outflow and return")

        if outflow.amount_kurus >= 0:
            raise BouncePairError("Outflow line must be negative")
        if return_line.amount_kurus <= 0:
            raise BouncePairError("Return line must be positive")
        payment_amount = abs(outflow.amount_kurus)
        if return_line.amount_kurus != payment_amount:
            raise BouncePairError("Return amount must equal the outflow amount")

        _assert_bounceable(outflow, label="Outflow line")
        _assert_bounceable(return_line, label="Return line")
        if fee is not None:
            if fee.amount_kurus >= 0:
                raise BouncePairError("Fee line must be an outflow")
            _assert_bounceable(fee, label="Fee line")

        _assert_person_exists(
            session, entity_id, person_type=person_type, person_id=person_id
        )

        active_journal = _find_active_payment_journal(
            session,
            person_type=person_type,
            person_id=person_id,
            amount_kurus=payment_amount,
            payment_date=outflow.transaction_date,
        )
        if active_journal is not None:
            raise BouncePairError(
                "A posted payment still exists for this person and amount — void the payment first"
            )

        pair = StatementBouncePair(
            entity_id=entity_id,
            statement_id=statement_id,
            person_type=person_type.value,
            person_id=person_id,
            outflow_line_id=outflow.id,
            return_line_id=return_line.id,
            fee_line_id=fee.id if fee is not None else None,
            voided_journal_entry_id=None,
            actor_id=actor_id,
            reason=reason.strip() if reason and reason.strip() else None,
        )
        session.add(pair)
        session.flush()

        _mark_bounced_line(
            outflow,
            person_type=person_type,
            person_id=person_id,
            bounce_pair_id=pair.id,
        )
        _mark_bounced_line(
            return_line,
            person_type=person_type,
            person_id=person_id,
            bounce_pair_id=pair.id,
        )

        fee_journal_id: uuid.UUID | None = None
        if fee is not None:
            fee_journal_id = _post_fee_line(
                session, entity_id, statement, fee, actor_id=actor_id
            )

        session.commit()
        session.refresh(pair)
        session.refresh(outflow)
        session.refresh(return_line)
        if fee is not None:
            session.refresh(fee)

        updated_lines = [
            _to_line_read(outflow, session=session),
            _to_line_read(return_line, session=session),
        ]
        if fee is not None:
            updated_lines.append(_to_line_read(fee, session=session))

        return StatementBouncePairResult(
            pair=StatementBouncePairRead.model_validate(pair),
            lines=updated_lines,
            fee_journal_entry_id=fee_journal_id,
        )
