"""Expense account checks for partner-fronted postings.

Extracted from `partners/posting.py` so the 5100 salary guard lives next to
the validation it extends — and so that file does not grow further.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import SALARY_EXPENSE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountType
from app.core.ledger.posting import InvalidAccountError


def validate_partner_fronted_expense_account(
    session: Session, entity_id: uuid.UUID, account_id: uuid.UUID
) -> Account:
    """Active expense account for partner-fronted spend — never 5100 Salaries."""
    account = session.get(Account, account_id)
    if account is None or account.entity_id != entity_id:
        raise InvalidAccountError("expense account not found for this entity")
    if not account.is_active:
        raise InvalidAccountError(f"account {account.code} is not active")
    if account.account_type != AccountType.EXPENSE:
        raise InvalidAccountError(
            f"account {account.code} is not an expense account"
        )
    if account.code == SALARY_EXPENSE_CODE:
        raise InvalidAccountError(
            "Salaries (5100) must be recorded via Staff → Pay salary "
            "(cash or partner-funded), not as a partner-fronted expense"
        )
    return account
