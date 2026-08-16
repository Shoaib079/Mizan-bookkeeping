"""Rebuilding a partner movement's GL lines when it is corrected.

One function per movement type, and a refusal for the rest. It lived in the
service, where it was the longest thing in the file and had nothing to do with
the HTTP shapes around it.

Two kinds of refusal, and they are different. `assert_source_is_correctable`
turns away an entry whose *source* has a second leg this route knows nothing
about — a partner-paid supplier invoice, a personal split. The dispatcher below
turns away a *movement type* for which no lines have been written. The first is
about safety, the second about what has been built.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    OWNER_DRAWINGS_CODE,
    PARTNER_CAPITAL_CODE,
    PARTNER_REIMBURSEMENT_PAYABLE_CODE,
)
from app.core.ledger.correction import CorrectionNotFoundError
from app.core.ledger.posting import PostingLine
from app.core.partners import posting as partner_posting
from app.core.partners.ledger import unpaid_profit_kurus
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.features.partners.schema import PartnerJournalEntryCorrect


def assert_source_is_correctable(session: Session, journal_entry_id: uuid.UUID) -> None:
    """Refuse to correct a partner row whose entry has a second leg.

    `build_partner_correction_lines` decides what to repost from the row's
    **movement type** alone, and three kinds of row have a movement type that
    does not describe their entry:

      - a partner-paid supplier invoice writes `expense_fronted` under source
        `partner_supplier_paid`
      - a personal expense split writes `drawing` under `expense_personal_split`
      - so does a personal supplier-payment split

    Each of those entries has another leg — the expense, or the supplier
    payment — that the correction knows nothing about. Reposting from the
    movement type alone rebuilt them as a plain drawing or a plain fronted
    expense and dropped the other half. Nothing failed; the split simply
    stopped being a split.

    The judgement lives in the capability table, which is where "can this
    source be edited" is already decided, rather than in a fourth hand-written
    list that would have to be kept in step with the other three.
    """
    from app.core.ledger.entry_capabilities import CAPABILITIES
    from app.core.ledger.models import JournalEntry

    entry = session.get(JournalEntry, journal_entry_id)
    if entry is None:
        raise CorrectionNotFoundError("journal entry not found")

    capability = CAPABILITIES.get(entry.source)
    if capability is not None and not capability.can_edit:
        raise CorrectionNotFoundError(
            f"a {entry.source.value} entry cannot be corrected in place — it "
            "has another leg this route would drop. Void it and re-enter."
        )


def _assert_within_unpaid_profit(
    session: Session,
    entity_id: uuid.UUID,
    partner_row: PartnerLedgerEntry,
    new_amount_kurus: int,
) -> None:
    """A corrected payment may not pay more profit than was ever allocated.

    `post_profit_paid` refuses that outright, and a correction has to refuse it
    for the same reason: paying 90.000 of a 75.000 share leaves the books
    saying a partner was paid profit the business never earned them.

    The row being corrected is still standing when this runs — the void and
    the repost happen after the lines are built — so its own amount is added
    back before comparing. Without that, raising a payment from 10.000 to
    10.001 would be refused against profit its own 10.000 had consumed.
    """
    unpaid = unpaid_profit_kurus(session, entity_id, partner_row.partner_id)
    allowance = unpaid + abs(partner_row.amount_kurus)
    if new_amount_kurus > allowance:
        raise ValueError(
            f"Payment of {new_amount_kurus} exceeds unpaid profit of {allowance}"
        )


def build_partner_correction_lines(
    session: Session,
    entity_id: uuid.UUID,
    partner_row: PartnerLedgerEntry,
    payload: PartnerJournalEntryCorrect,
) -> tuple[list[PostingLine], int]:
    amount_kurus = (
        payload.amount_kurus if payload.amount_kurus is not None else partner_row.amount_kurus
    )
    movement_type = partner_row.movement_type

    if movement_type == PartnerMovementType.EXPENSE_FRONTED:
        if payload.expense_account_id is None:
            raise ValueError("expense_account_id required for expense fronted correction")
        expense = partner_posting._validate_expense_account(
            session, entity_id, payload.expense_account_id
        )
        payable = partner_posting._chart_account(session, PARTNER_REIMBURSEMENT_PAYABLE_CODE)
        lines = partner_posting.build_expense_fronted_lines(
            expense_account_id=expense.id,
            partner_payable_id=payable.id,
            amount_kurus=amount_kurus,
        )
        return lines, amount_kurus

    if movement_type == PartnerMovementType.REIMBURSEMENT_PAID:
        if payload.payment_account_id is None:
            raise ValueError("payment_account_id required for reimbursement correction")
        payment = partner_posting._validate_payment_account(
            session, entity_id, payload.payment_account_id
        )
        payable = partner_posting._chart_account(session, PARTNER_REIMBURSEMENT_PAYABLE_CODE)
        lines = partner_posting.build_reimbursement_paid_lines(
            partner_payable_id=payable.id,
            payment_account_id=payment.id,
            amount_kurus=amount_kurus,
        )
        return lines, amount_kurus

    if movement_type == PartnerMovementType.DRAWING:
        if payload.payment_account_id is None:
            raise ValueError("payment_account_id required for drawing correction")
        gl_amount = (
            payload.amount_kurus
            if payload.amount_kurus is not None
            else abs(partner_row.amount_kurus)
        )
        payment = partner_posting._validate_payment_account(
            session, entity_id, payload.payment_account_id
        )
        drawings = partner_posting._chart_account(session, OWNER_DRAWINGS_CODE)
        lines = partner_posting.build_drawing_lines(
            drawings_account_id=drawings.id,
            payment_account_id=payment.id,
            amount_kurus=gl_amount,
        )
        return lines, -gl_amount

    if movement_type == PartnerMovementType.DRAWING_REPAYMENT:
        if payload.payment_account_id is None:
            raise ValueError("payment_account_id required for drawing repayment correction")
        gl_amount = (
            payload.amount_kurus
            if payload.amount_kurus is not None
            else abs(partner_row.amount_kurus)
        )
        payment = partner_posting._validate_payment_account(
            session, entity_id, payload.payment_account_id
        )
        drawings = partner_posting._chart_account(session, OWNER_DRAWINGS_CODE)
        lines = partner_posting.build_drawing_repayment_lines(
            drawings_account_id=drawings.id,
            payment_account_id=payment.id,
            amount_kurus=gl_amount,
        )
        return lines, gl_amount

    if movement_type == PartnerMovementType.PROFIT_ALLOCATION:
        raise CorrectionNotFoundError(
            "profit allocation must be voided at entity level, not per-partner correct"
        )

    if movement_type == PartnerMovementType.PROFIT_SETTLEMENT:
        raise CorrectionNotFoundError(
            "profit allocation must be voided at entity level, not per-partner correct"
        )

    if movement_type == PartnerMovementType.PROFIT_PAID:
        if payload.payment_account_id is None:
            raise ValueError("payment_account_id required for profit payment correction")
        gl_amount = (
            payload.amount_kurus
            if payload.amount_kurus is not None
            else abs(partner_row.amount_kurus)
        )
        _assert_within_unpaid_profit(session, entity_id, partner_row, gl_amount)
        payment = partner_posting._validate_payment_account(
            session, entity_id, payload.payment_account_id
        )
        capital = partner_posting._chart_account(session, PARTNER_CAPITAL_CODE)
        lines = partner_posting.build_profit_paid_lines(
            partner_capital_id=capital.id,
            payment_account_id=payment.id,
            amount_kurus=gl_amount,
        )
        return lines, -gl_amount

    raise CorrectionNotFoundError("partner movement type is not correctable")
