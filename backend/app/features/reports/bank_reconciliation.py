"""Bank reconciliation — does each bank account agree with the bank?

The cash book proves the drawer by counting it. A bank account is proved the
other way round: by agreeing with the bank's own record. Nothing in the app
answered "is this account done?", so unreviewed statement lines could sit
unnoticed for weeks.

Two levels of proof, and the difference matters:

1. Books vs imported lines — every statement line that has been classified is
   posted, so the gap between the account's GL balance and the sum of imported
   lines is exactly the lines still awaiting review. Always available.
2. Books vs the balance the BANK printed — catches lines missing from the
   import entirely (truncated export, a dropped day), which level 1 cannot see
   because books and file agree with each other while both are wrong. Needs
   `closing_balance_kurus` on the statement, which is nullable.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.ledger.balances import balance_as_of_kurus
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.banking.statement_closing import effective_stated_closing_balance_kurus
from app.features.banking.statement_models import (
    BankStatement,
    BankStatementLine,
    StatementLineStatus,
)
from app.features.entities import service as entity_service
from app.features.reports.schema import (
    BankReconciliationAccount,
    BankReconciliationRead,
    UnreconciledLine,
)

__all__ = ["get_bank_reconciliation"]

# Lines that have become journal entries; anything else still owes the books.
SETTLED_LINE_STATUSES = (StatementLineStatus.POSTED, StatementLineStatus.LINKED)

# Bank-like accounts: money held at an institution, reconciled against a
# statement (as opposed to cash, which is reconciled by counting).
BANK_LIKE_KINDS = (MoneyAccountKind.BANK, MoneyAccountKind.CREDIT_CARD)


def get_bank_reconciliation(
    session: Session,
    entity_id: uuid.UUID,
    *,
    as_of: date | None = None,
    money_account_id: uuid.UUID | None = None,
) -> BankReconciliationRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    accounts_out: list[BankReconciliationAccount] = []

    with entity_context(session, entity_id):
        require_entity_context()

        filters = [
            MoneyAccount.account_kind.in_(BANK_LIKE_KINDS),
            MoneyAccount.is_active.is_(True),
        ]
        if money_account_id is not None:
            filters.append(MoneyAccount.id == money_account_id)
        money_accounts = list(
            session.scalars(select(MoneyAccount).where(*filters).order_by(MoneyAccount.name))
        )
        if money_account_id is not None and not money_accounts:
            raise LookupError("Bank account not found")

        for account in money_accounts:
            gl_account = session.get(Account, account.gl_account_id)
            if gl_account is None:
                continue

            statements = list(
                session.scalars(
                    select(BankStatement)
                    .where(BankStatement.money_account_id == account.id)
                    .order_by(BankStatement.period_end.desc())
                )
            )
            statement_ids = [s.id for s in statements]
            latest = statements[0] if statements else None

            # Compare book to the latest statement's closing — not today's GL balance.
            # Activity after period_end (e.g. August expenses) belongs in the next statement.
            if as_of is not None:
                book_as_of = as_of
            elif latest is not None:
                book_as_of = latest.period_end
            else:
                book_as_of = date.max

            book_balance = balance_as_of_kurus(session, gl_account, book_as_of)

            pending_rows: list[BankStatementLine] = []
            pending_total = 0
            imported_total = 0
            if statement_ids:
                imported_total = int(
                    session.scalar(
                        select(func.coalesce(func.sum(BankStatementLine.amount_kurus), 0)).where(
                            BankStatementLine.statement_id.in_(statement_ids)
                        )
                    )
                    or 0
                )
                pending_rows = list(
                    session.scalars(
                        select(BankStatementLine)
                        .where(
                            BankStatementLine.statement_id.in_(statement_ids),
                            BankStatementLine.status.not_in(SETTLED_LINE_STATUSES),
                        )
                        .order_by(BankStatementLine.transaction_date)
                    )
                )
                pending_total = sum(line.amount_kurus for line in pending_rows)

            stated_balance = effective_stated_closing_balance_kurus(
                session, gl_account, statements, latest
            )
            # Books + what's still unclassified should equal what the bank says.
            missing_from_import = (
                stated_balance - (book_balance + pending_total)
                if stated_balance is not None
                else None
            )

            accounts_out.append(
                BankReconciliationAccount(
                    money_account_id=account.id,
                    name=account.name,
                    account_kind=account.account_kind.value,
                    book_balance_kurus=book_balance,
                    book_balance_as_of=book_as_of if book_as_of != date.max else None,
                    imported_lines_total_kurus=imported_total,
                    unreconciled_count=len(pending_rows),
                    unreconciled_total_kurus=pending_total,
                    statement_period_end=latest.period_end if latest is not None else None,
                    stated_closing_balance_kurus=stated_balance,
                    missing_from_import_kurus=missing_from_import,
                    is_reconciled=len(pending_rows) == 0
                    and (missing_from_import in (None, 0)),
                    latest_statement_id=latest.id if latest is not None else None,
                    lines=[
                        UnreconciledLine(
                            id=line.id,
                            statement_id=line.statement_id,
                            transaction_date=line.transaction_date,
                            description=line.description,
                            amount_kurus=line.amount_kurus,
                            status=line.status.value,
                        )
                        for line in pending_rows[:100]
                    ],
                )
            )

    return BankReconciliationRead(as_of=as_of, accounts=accounts_out)
