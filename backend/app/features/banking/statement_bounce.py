"""Record payment bounced pairs on bank statements (supplier / staff / partner)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.features.banking.statement_bounce_fees import (
    is_bounce_fee_candidate_line,
    is_unposted_bounce_fee_line,
    primary_fee_line_id,
    settle_bounce_fee_lines,
    settle_manual_bounce_net_fee,
)
from app.features.partners.models import Partner
from app.features.staff.models import Employee
from app.features.suppliers.models import Supplier
from app.db.session import entity_context, require_entity_context
from app.features.banking.schema import (
    BankStatementLineRead,
)
from app.features.banking.statement_bounce_schema import (
    StatementBouncePairRead,
    StatementBouncePairRequest,
    StatementBouncePairResult,
)
from app.features.banking.statement_bounce_prepare import (
    AUTO_VOID_ORPHAN_PAYMENT_MSG,
    BouncePairError,
    prepare_line_for_bounce,
    void_orphan_person_payment,
)
from app.features.banking.statement_bounce_payments import find_active_payment_journal
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


def _resolve_fee_line_ids(
    fee_line_id: uuid.UUID | None,
    fee_line_ids: list[uuid.UUID] | None,
) -> list[uuid.UUID]:
    if fee_line_ids:
        return list(dict.fromkeys(fee_line_ids))
    if fee_line_id is not None:
        return [fee_line_id]
    return []


def record_payment_bounce_from_request(
    session: Session,
    entity_id: uuid.UUID,
    statement_id: uuid.UUID,
    payload: StatementBouncePairRequest,
    actor_id: uuid.UUID,
) -> StatementBouncePairResult:
    return record_payment_bounce(
        session,
        entity_id,
        statement_id,
        outflow_line_id=payload.outflow_line_id,
        return_line_id=payload.return_line_id,
        person_type=BouncePersonType(payload.person_type),
        person_id=payload.person_id,
        fee_line_id=payload.fee_line_id,
        fee_line_ids=payload.fee_line_ids,
        actor_id=actor_id,
        reason=payload.reason,
        auto_void_confirmed=payload.auto_void_confirmed,
        manual_net_fee_kurus=payload.manual_net_fee_kurus,
    )


def record_payment_bounce(
    session: Session,
    entity_id: uuid.UUID,
    statement_id: uuid.UUID,
    *,
    outflow_line_id: uuid.UUID,
    return_line_id: uuid.UUID,
    person_type: BouncePersonType,
    person_id: uuid.UUID,
    fee_line_id: uuid.UUID | None = None,
    fee_line_ids: list[uuid.UUID] | None = None,
    actor_id: uuid.UUID,
    reason: str | None = None,
    auto_void_confirmed: bool = False,
    manual_net_fee_kurus: int | None = None,
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
        resolved_fee_ids = _resolve_fee_line_ids(fee_line_id, fee_line_ids)
        fee_lines = [
            _get_line(session, statement_id, fee_id, label="Fee line")
            for fee_id in resolved_fee_ids
        ]

        if outflow.id == return_line.id:
            raise BouncePairError("Outflow and return must be different lines")
        fee_ids = {line.id for line in fee_lines}
        if fee_ids & {outflow.id, return_line.id}:
            raise BouncePairError("Fee lines must differ from outflow and return")

        if outflow.amount_kurus >= 0:
            raise BouncePairError("Outflow line must be negative")
        if return_line.amount_kurus <= 0:
            raise BouncePairError("Return line must be positive")
        payment_amount = abs(outflow.amount_kurus)
        if return_line.amount_kurus != payment_amount:
            raise BouncePairError("Return amount must equal the outflow amount")

        for index, fee in enumerate(fee_lines, start=1):
            if fee.amount_kurus == 0:
                raise BouncePairError(f"Fee line {index} must be non-zero")
            if not is_unposted_bounce_fee_line(fee):
                raise BouncePairError(f"Fee line {index} is already posted — cannot use as fee")
            if not is_bounce_fee_candidate_line(fee):
                raise BouncePairError(
                    f"Fee line {index} does not look like a bank fee or fee refund"
                )

        if manual_net_fee_kurus is not None and fee_lines:
            raise BouncePairError("Use fee lines or manual net fee, not both")

        _assert_person_exists(
            session, entity_id, person_type=person_type, person_id=person_id
        )

        voided_journal_ids: list[uuid.UUID] = []
        bounce_reason = reason.strip() if reason and reason.strip() else None

        outflow_voided = prepare_line_for_bounce(
            session,
            entity_id,
            outflow,
            label="Outflow line",
            auto_void_confirmed=auto_void_confirmed,
            actor_id=actor_id,
            reason=bounce_reason,
            person_type=person_type,
        )
        if outflow_voided is not None:
            voided_journal_ids.append(outflow_voided)

        return_voided = prepare_line_for_bounce(
            session,
            entity_id,
            return_line,
            label="Return line",
            auto_void_confirmed=auto_void_confirmed,
            actor_id=actor_id,
            reason=bounce_reason,
        )
        if return_voided is not None:
            voided_journal_ids.append(return_voided)

        for index, fee in enumerate(fee_lines, start=1):
            fee_voided = prepare_line_for_bounce(
                session,
                entity_id,
                fee,
                label=f"Fee line {index}",
                auto_void_confirmed=auto_void_confirmed,
                actor_id=actor_id,
                reason=bounce_reason,
            )
            if fee_voided is not None:
                voided_journal_ids.append(fee_voided)

        exclude = set(voided_journal_ids)
        orphan_journal = find_active_payment_journal(
            session,
            person_type=person_type,
            person_id=person_id,
            amount_kurus=payment_amount,
            payment_date=outflow.transaction_date,
            exclude_journal_ids=exclude,
        )
        if orphan_journal is not None:
            if not auto_void_confirmed:
                raise BouncePairError(AUTO_VOID_ORPHAN_PAYMENT_MSG)
            void_orphan_person_payment(
                session,
                entity_id,
                orphan_journal,
                person_type=person_type,
                actor_id=actor_id,
                reason=f"Auto-voided for bounce: {bounce_reason or 'Payment returned'}",
                void_date=outflow.transaction_date,
            )
            voided_journal_ids.append(orphan_journal)
            session.refresh(outflow)
            session.refresh(return_line)

        primary_voided = voided_journal_ids[0] if voided_journal_ids else None

        pair = StatementBouncePair(
            entity_id=entity_id,
            statement_id=statement_id,
            person_type=person_type.value,
            person_id=person_id,
            outflow_line_id=outflow.id,
            return_line_id=return_line.id,
            fee_line_id=primary_fee_line_id(fee_lines),
            voided_journal_entry_id=primary_voided,
            actor_id=actor_id,
            reason=bounce_reason,
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
        if fee_lines:
            try:
                fee_journal_id = settle_bounce_fee_lines(
                    session,
                    entity_id,
                    statement,
                    fee_lines,
                    bounce_pair_id=pair.id,
                    actor_id=actor_id,
                )
            except ValueError as exc:
                raise BouncePairError(str(exc)) from exc
        elif manual_net_fee_kurus is not None and manual_net_fee_kurus != 0:
            try:
                fee_journal_id = settle_manual_bounce_net_fee(
                    session,
                    entity_id,
                    statement,
                    manual_net_fee_kurus,
                    entry_date=outflow.transaction_date,
                    actor_id=actor_id,
                )
            except ValueError as exc:
                raise BouncePairError(str(exc)) from exc

        session.commit()
        session.refresh(pair)
        session.refresh(outflow)
        session.refresh(return_line)
        for fee in fee_lines:
            session.refresh(fee)

        updated_lines = [
            _to_line_read(outflow, session=session),
            _to_line_read(return_line, session=session),
        ]
        updated_lines.extend(_to_line_read(fee, session=session) for fee in fee_lines)

        return StatementBouncePairResult(
            pair=StatementBouncePairRead.model_validate(pair),
            lines=updated_lines,
            fee_journal_entry_id=fee_journal_id,
        )
