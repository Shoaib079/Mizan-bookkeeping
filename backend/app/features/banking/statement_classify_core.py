"""What every classification does to a statement line once it is posted.

Lifted out of `statements.py` so the twenty-two posters can share it without
importing the module that dispatches them. `statements.py` reads this, and so
does every poster; nothing here reads either, which is what keeps the imports
acyclic.

The pieces belong together for a better reason than that, though: they are the
whole of what happens to a line *after* a posting succeeds. Marking it posted,
recording which counterparty it names, learning a rule from it, and shaping the
answer the API returns. Twenty-two branches used to do all of it inline, and
the copies had drifted — see `_finish_classified_line`.
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import entity_context, require_entity_context
from app.features.banking.classification_learning import learn_classification_rule
from app.features.banking.supplier_suggest_service import suggest_line_classification
from app.features.banking.models import MoneyAccount
from app.features.banking.schema import (
    BankStatementLineRead,
    ClassifyStatementLineResult,
)
from app.features.banking.statement_models import (
    BankStatement,
    BankStatementLine,
    StatementLineClassification,
    StatementLineClassificationSource,
    StatementLineStatus,
)
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import StaffMovementType
from app.features.suppliers.models import Supplier


#: `reference_type` on a ledger entry that came from a bank statement line.
#:
#: Was written out twice — here and in `statement_rule_auto.py` — as the same
#: string literal. Two copies of a value that must match is Class 1; it only
#: came to light when the posters moved out and needed to import it from
#: somewhere.
BANK_STATEMENT_LINE_REF = "bank_statement_line"

#: The classifications whose line names a person, used to read the id back off
#: the subledger when the line itself does not carry it.
_STAFF_LINE_CLASSIFICATIONS = frozenset(
    {
        StatementLineClassification.STAFF_PAYMENT,
        StatementLineClassification.STAFF_ADVANCE,
        StatementLineClassification.STAFF_INCENTIVE,
    }
)

_PARTNER_LINE_CLASSIFICATIONS = frozenset(
    {
        StatementLineClassification.PARTNER_DRAWING,
        StatementLineClassification.PARTNER_REIMBURSEMENT,
        StatementLineClassification.PARTNER_DRAWING_REPAYMENT,
        StatementLineClassification.PARTNER_CAPITAL_CONTRIBUTION,
        StatementLineClassification.PARTNER_PROFIT_PAID,
        StatementLineClassification.PARTNER_LOAN_RECEIPT,
        StatementLineClassification.PARTNER_LOAN_PAYMENT,
    }
)


class InvalidClassificationError(ValueError):
    """Raised when classification preconditions fail."""


@dataclass(frozen=True)
class _ClassifyContext:
    """Everything the preamble worked out, handed to whichever poster runs.

    The twenty-two branches read the same handful of things: the line and its
    statement, the bank account behind it, and whichever counterparty the
    caller named. Passing them as one object is what lets each branch become a
    function with a name, instead of 758 lines of `if classification == …`
    that can only be read top to bottom.
    """

    session: Session
    entity_id: uuid.UUID
    statement: BankStatement
    line: BankStatementLine
    line_id: uuid.UUID
    money_account: MoneyAccount
    classification: StatementLineClassification
    actor_id: uuid.UUID | None = None
    match_token: str | None = None
    supplier_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    partner_id: uuid.UUID | None = None
    employee_id: uuid.UUID | None = None
    expense_account_id: uuid.UUID | None = None
    income_account_id: uuid.UUID | None = None
    credit_card_money_account_id: uuid.UUID | None = None
    delivery_platform_id: uuid.UUID | None = None
    note: str | None = None
    period_year: int | None = None
    period_month: int | None = None
    period_salary_minor: int | None = None


def _resolve_employee_id_for_line(
    session: Session,
    line: BankStatementLine,
) -> uuid.UUID | None:
    if line.employee_id is not None:
        return line.employee_id
    if line.journal_entry_id is None or line.classification not in _STAFF_LINE_CLASSIFICATIONS:
        return None
    preferred = session.scalar(
        select(StaffLedgerEntry.employee_id)
        .where(StaffLedgerEntry.journal_entry_id == line.journal_entry_id)
        .where(
            StaffLedgerEntry.movement_type.in_(
                (
                    StaffMovementType.SALARY_PAYMENT,
                    StaffMovementType.ADVANCE_PAID,
                    StaffMovementType.INCENTIVE_PAID,
                )
            )
        )
        .limit(1)
    )
    if preferred is not None:
        return preferred
    return session.scalar(
        select(StaffLedgerEntry.employee_id)
        .where(StaffLedgerEntry.journal_entry_id == line.journal_entry_id)
        .limit(1)
    )


def _resolve_partner_id_for_line(
    session: Session,
    line: BankStatementLine,
) -> uuid.UUID | None:
    if line.partner_id is not None:
        return line.partner_id
    if line.journal_entry_id is None or line.classification not in _PARTNER_LINE_CLASSIFICATIONS:
        return None
    return session.scalar(
        select(PartnerLedgerEntry.partner_id)
        .where(PartnerLedgerEntry.journal_entry_id == line.journal_entry_id)
        .where(
            PartnerLedgerEntry.movement_type.in_(
                (
                    PartnerMovementType.DRAWING,
                    PartnerMovementType.REIMBURSEMENT_PAID,
                    PartnerMovementType.DRAWING_REPAYMENT,
                    PartnerMovementType.CAPITAL_CONTRIBUTION,
                    PartnerMovementType.PROFIT_PAID,
                    PartnerMovementType.PARTNER_LOAN_RECEIVED,
                    PartnerMovementType.PARTNER_LOAN_REPAID,
                )
            )
        )
        .limit(1)
    )


def _to_line_read(
    line: BankStatementLine,
    *,
    session: Session | None = None,
) -> BankStatementLineRead:
    suggestion = None
    if session is not None and line.status in (
        StatementLineStatus.NEEDS_REVIEW,
        StatementLineStatus.IMPORTED,
    ):
        try:
            entity_id = require_entity_context()
            suggestion = suggest_line_classification(
                session,
                entity_id,
                line.description,
                amount_kurus=line.amount_kurus,
            )
        except RuntimeError:
            suggestion = None
    employee_id = line.employee_id
    partner_id = line.partner_id
    if session is not None:
        employee_id = _resolve_employee_id_for_line(session, line)
        partner_id = _resolve_partner_id_for_line(session, line)
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
        employee_id=employee_id,
        partner_id=partner_id,
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
        classification_source=line.classification_source,
        suggestion=suggestion,
    )


def _line_read_by_id(
    session: Session,
    entity_id: uuid.UUID,
    line_id: uuid.UUID,
) -> BankStatementLineRead:
    with entity_context(session, entity_id):
        line = session.get(BankStatementLine, line_id)
        if line is None:
            raise LookupError("Statement line not found")
        return _to_line_read(line, session=session)


def _record_classification_learning(
    session: Session,
    entity_id: uuid.UUID,
    line: BankStatementLine,
    classification: StatementLineClassification,
    *,
    supplier_id: uuid.UUID | None = None,
    delivery_platform_id: uuid.UUID | None = None,
    match_token: str | None = None,
    expense_account_id: uuid.UUID | None = None,
) -> None:
    """Persist a learned rule after successful user classification (never auto-posts)."""
    description = line.description
    learned_supplier_id = (
        supplier_id if supplier_id is not None else line.supplier_id
    )
    learned_match_token = match_token.strip() if match_token and match_token.strip() else None
    counterparty_name: str | None = None
    with entity_context(session, entity_id):
        require_entity_context()
        if learned_supplier_id is not None:
            supplier = session.get(Supplier, learned_supplier_id)
            if supplier is not None:
                counterparty_name = supplier.name
        elif delivery_platform_id is not None:
            from app.features.delivery import platform_service as delivery_platform_service

            try:
                platform = delivery_platform_service.get_delivery_platform_row(
                    session, entity_id, delivery_platform_id
                )
                counterparty_name = platform.name
            except LookupError:
                counterparty_name = None
        learn_classification_rule(
            session,
            description=description,
            classification=classification,
            supplier_id=learned_supplier_id,
            delivery_platform_id=delivery_platform_id,
            expense_account_id=expense_account_id,
            match_token=learned_match_token,
            counterparty_name=counterparty_name,
        )
        session.commit()


def _finish_classified_line(
    session: Session,
    entity_id: uuid.UUID,
    line_id: uuid.UUID,
    classification: StatementLineClassification,
    journal_entry_id: uuid.UUID,
    *,
    match_token: str | None = None,
    links: Mapping[str, uuid.UUID | None] | None = None,
    learn_supplier_id: uuid.UUID | None = None,
    learn_delivery_platform_id: uuid.UUID | None = None,
    learn_expense_account_id: uuid.UUID | None = None,
) -> ClassifyStatementLineResult:
    """Mark a line posted, learn from it, and answer the caller.

    Twenty-two classifications ended with the same forty lines: reload the
    line, set classification/status/journal id, commit, record a learned rule,
    build the result. They were copies, and copies drift — this is what the
    drift looked like when they were finally read side by side.

    **`classification_source` was set by two of twenty-two.** Every reader
    compares against `"rule_auto"`, so NULL and `"manual"` behave identically
    and nothing is wrong today. But the natural thing for the next person to
    write is `== "manual"`, and twenty classifications would fall silently
    outside it. All of them set it now.

    **`OTHER_INCOME` recorded no learning at all** — the only one. A learned
    rule that is not auto-postable still pre-labels the next matching line in
    the review queue, so this is the difference between the app remembering a
    recurring rent *payment* and forgetting the rent *receipt* beside it. It
    learns now, without an account: `apply_import_rule_auto` does not post
    income automatically, so there is nothing an account would be used for,
    and storing one in a column named `expense_account_id` would be a lie for
    no gain.

    `links` carries the per-classification foreign keys — the partner, the
    employee, the settlement being matched — because that is the whole of what
    genuinely differed between the twenty-two.
    """
    with entity_context(session, entity_id):
        line = session.get(BankStatementLine, line_id)
        assert line is not None
        line.classification = classification
        line.status = StatementLineStatus.POSTED
        line.journal_entry_id = journal_entry_id
        line.classification_source = StatementLineClassificationSource.MANUAL.value
        for field, value in (links or {}).items():
            # `setattr` takes any string. A key that is not a column silently
            # becomes an ordinary Python attribute on the instance, the commit
            # succeeds, and the counterparty is simply never recorded — no
            # error, no log, a supplier payment with no supplier on the line.
            #
            # That is not hypothetical: extracting these branches into posters
            # rewrote twelve of these keys by mistake, and the suite caught one
            # of the twelve. This is the check that would have caught all of
            # them, and it costs one dict lookup per classification.
            if field not in BankStatementLine.__mapper__.columns:
                raise AttributeError(
                    f"{field!r} is not a column of bank_statement_lines — "
                    "a link key must name a real column, or it is dropped"
                )
            setattr(line, field, value)
        session.commit()
        session.refresh(line)

    _record_classification_learning(
        session,
        entity_id,
        line,
        classification,
        supplier_id=learn_supplier_id,
        delivery_platform_id=learn_delivery_platform_id,
        expense_account_id=learn_expense_account_id,
        match_token=match_token,
    )
    return ClassifyStatementLineResult(
        line=_line_read_by_id(session, entity_id, line_id),
        linked_existing_payment=False,
        linked_existing_transfer=False,
        routed_to_needs_review=False,
        journal_entry_id=journal_entry_id,
    )
