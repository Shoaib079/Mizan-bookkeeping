"""Bank account activity — chronological inflows/outflows (Decisions §12).

Statement lines drive deposits/out/net-on-statements totals. Opening balance
journal lines on this bank's GL account appear in the timeline and in posted
in/out so the running book balance matches the GL closing row.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.balances import balance_as_of_kurus
from app.core.ledger.models import (
    JournalEntry,
    JournalEntryLine,
    JournalEntrySource,
    JournalEntryStatus,
)
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.banking.schema import BankActivityRead, BankActivityRow
from app.features.banking.statement_models import (
    BankStatement,
    BankStatementLine,
    StatementLineClassification,
    StatementLineStatus,
)
from app.features.banking.statements import NotBankAccountError
from app.features.entities import service as entity_service

_SETTLED = (StatementLineStatus.POSTED, StatementLineStatus.LINKED)

_CLASSIFICATION_LABELS: dict[StatementLineClassification, str] = {
    StatementLineClassification.UNCLASSIFIED: "Unclassified",
    StatementLineClassification.SUPPLIER_PAYMENT: "Supplier payment",
    StatementLineClassification.TRANSFER: "Transfer",
    StatementLineClassification.POS_SETTLEMENT: "POS settlement",
    StatementLineClassification.POS_COMMISSION: "POS commission",
    StatementLineClassification.DELIVERY_SETTLEMENT: "Delivery settlement",
    StatementLineClassification.BANK_FEE: "Bank fee",
    StatementLineClassification.RENT_UTILITY: "Rent / utility",
    StatementLineClassification.OTHER_INCOME: "Other income",
    StatementLineClassification.STORE_PURCHASE: "Store purchase",
    StatementLineClassification.CREDIT_CARD_PAYMENT: "Card payment",
    StatementLineClassification.CUSTOMER_PAYMENT: "Customer payment",
    StatementLineClassification.STAFF_PAYMENT: "Staff salary",
    StatementLineClassification.STAFF_ADVANCE: "Staff advance",
    StatementLineClassification.STAFF_INCENTIVE: "Staff incentive",
    StatementLineClassification.PARTNER_DRAWING: "Partner drawing",
    StatementLineClassification.PARTNER_REIMBURSEMENT: "Partner reimbursement",
    StatementLineClassification.PARTNER_DRAWING_REPAYMENT: "Drawing repayment",
    StatementLineClassification.PARTNER_CAPITAL_CONTRIBUTION: "Capital contribution",
    StatementLineClassification.PARTNER_PROFIT_PAID: "Partner profit paid",
    StatementLineClassification.PARTNER_LOAN_RECEIPT: "Partner loan in",
    StatementLineClassification.PARTNER_LOAN_PAYMENT: "Partner loan payment",
    StatementLineClassification.LOAN_PAYMENT: "Loan payment",
    StatementLineClassification.LOAN_RECEIPT: "Loan receipt",
    StatementLineClassification.UNKNOWN: "Unknown",
}


@dataclass(frozen=True, slots=True)
class _OpeningBalanceMovement:
    movement_date: date
    amount_kurus: int
    detail: str
    journal_entry_id: uuid.UUID


@dataclass(frozen=True, slots=True)
class _StatementMovement:
    line: BankStatementLine


def _signed_gl_amount_kurus(
    amount_kurus: int,
    side: AccountNormalBalance,
    *,
    normal_balance: AccountNormalBalance,
) -> int:
    """Signed inflow/outflow for a money-account GL line (debit-normal asset)."""
    is_in = side == normal_balance
    return amount_kurus if is_in else -amount_kurus


def _opening_balance_movements(
    session: Session,
    gl_account: Account,
    *,
    from_date: date,
    to_date: date,
) -> list[_OpeningBalanceMovement]:
    records = session.execute(
        select(
            JournalEntry.entry_date,
            JournalEntry.description,
            JournalEntry.id,
            JournalEntryLine.amount_kurus,
            JournalEntryLine.side,
        )
        .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
        .where(
            JournalEntryLine.account_id == gl_account.id,
            JournalEntry.status == JournalEntryStatus.POSTED.value,
            JournalEntry.reverses_entry_id.is_(None),
            JournalEntry.source == JournalEntrySource.OPENING_BALANCE,
            JournalEntry.entry_date >= from_date,
            JournalEntry.entry_date <= to_date,
        )
        .order_by(JournalEntry.entry_date, JournalEntry.id)
    ).all()

    movements: list[_OpeningBalanceMovement] = []
    for entry_date, description, journal_entry_id, amount_kurus, side in records:
        movements.append(
            _OpeningBalanceMovement(
                movement_date=entry_date,
                amount_kurus=_signed_gl_amount_kurus(
                    amount_kurus,
                    side,
                    normal_balance=gl_account.normal_balance,
                ),
                detail=description or "Opening balances",
                journal_entry_id=journal_entry_id,
            )
        )
    return movements


def _require_bank_account(session: Session, money_account_id: uuid.UUID) -> MoneyAccount:
    account = session.get(MoneyAccount, money_account_id)
    if account is None:
        raise LookupError("Money account not found")
    if account.account_kind != MoneyAccountKind.BANK:
        raise NotBankAccountError("Activity timeline is only for bank accounts")
    return account


def get_bank_account_activity(
    session: Session,
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    *,
    from_date: date,
    to_date: date,
) -> BankActivityRead:
    if from_date > to_date:
        raise ValueError("from must be on or before to")

    entity_service.get_entity(session, entity_id)

    with entity_context(session, entity_id):
        require_entity_context()
        money_account = _require_bank_account(session, money_account_id)
        gl_account = session.get(Account, money_account.gl_account_id)
        if gl_account is None:
            raise LookupError("GL account not found")

        opening_day = from_date - timedelta(days=1)
        opening_balance = balance_as_of_kurus(session, gl_account, opening_day)
        closing_balance = balance_as_of_kurus(session, gl_account, to_date)

        lines = list(
            session.scalars(
                select(BankStatementLine)
                .join(BankStatement, BankStatement.id == BankStatementLine.statement_id)
                .where(
                    BankStatement.money_account_id == money_account_id,
                    BankStatementLine.transaction_date >= from_date,
                    BankStatementLine.transaction_date <= to_date,
                )
                .order_by(
                    BankStatementLine.transaction_date,
                    BankStatementLine.id,
                )
            )
        )

        opening_balance_movements = _opening_balance_movements(
            session,
            gl_account,
            from_date=from_date,
            to_date=to_date,
        )

        timeline: list[
            tuple[date, int, uuid.UUID, _OpeningBalanceMovement | _StatementMovement]
        ] = []
        for movement in opening_balance_movements:
            timeline.append(
                (
                    movement.movement_date,
                    0,
                    movement.journal_entry_id,
                    movement,
                )
            )
        for line in lines:
            timeline.append((line.transaction_date, 1, line.id, _StatementMovement(line=line)))
        timeline.sort(key=lambda item: (item[0], item[1], item[2]))

        total_in = 0
        total_out = 0
        posted_in = 0
        posted_out = 0
        running_book = opening_balance
        rows: list[BankActivityRow] = []

        rows.append(
            BankActivityRow(
                movement_date=from_date,
                movement_kind="opening",
                movement_label="Opening",
                detail="Book balance at start of period",
                amount_kurus=None,
                balance_kurus=opening_balance,
                affects_balance=True,
                statement_line_id=None,
                classification=None,
                status=None,
            )
        )

        for _, _, _, event in timeline:
            if isinstance(event, _OpeningBalanceMovement):
                amount = event.amount_kurus
                running_book += amount
                if amount > 0:
                    posted_in += amount
                elif amount < 0:
                    posted_out += abs(amount)

                rows.append(
                    BankActivityRow(
                        movement_date=event.movement_date,
                        movement_kind="opening_balance",
                        movement_label="Opening balance",
                        detail=event.detail,
                        amount_kurus=amount,
                        balance_kurus=running_book,
                        affects_balance=True,
                        statement_line_id=None,
                        classification=None,
                        status=None,
                    )
                )
                continue

            line = event.line
            amount = line.amount_kurus
            if amount > 0:
                total_in += amount
            elif amount < 0:
                total_out += abs(amount)

            settled = line.status in _SETTLED
            if settled:
                running_book += amount
                if amount > 0:
                    posted_in += amount
                elif amount < 0:
                    posted_out += abs(amount)

            label = _CLASSIFICATION_LABELS.get(
                line.classification, line.classification.value
            )
            if line.status == StatementLineStatus.NEEDS_REVIEW:
                label = f"{label} · review"

            rows.append(
                BankActivityRow(
                    movement_date=line.transaction_date,
                    movement_kind="statement_line",
                    movement_label=label,
                    detail=line.description,
                    amount_kurus=amount,
                    balance_kurus=running_book,
                    affects_balance=settled,
                    statement_line_id=line.id,
                    classification=line.classification.value,
                    status=line.status.value,
                )
            )

        rows.append(
            BankActivityRow(
                movement_date=to_date,
                movement_kind="closing",
                movement_label="Closing",
                detail="Book balance at end of period",
                amount_kurus=None,
                balance_kurus=closing_balance,
                affects_balance=True,
                statement_line_id=None,
                classification=None,
                status=None,
            )
        )

        return BankActivityRead(
            money_account_id=money_account.id,
            account_name=money_account.name,
            from_date=from_date,
            to_date=to_date,
            opening_balance_kurus=opening_balance,
            closing_balance_kurus=closing_balance,
            total_in_kurus=total_in,
            total_out_kurus=total_out,
            net_flow_kurus=total_in - total_out,
            posted_in_kurus=posted_in,
            posted_out_kurus=posted_out,
            rows=rows,
        )
