"""Manual money movements are cash-only. Bank money arrives on a statement.

A bank payment already exists as a line on an imported statement, and the app
records it by classifying that line. Typing the same payment in by hand as
well produces two entries for one movement — the classified line and the
manual one — and the reconciliation that would have caught it is the very
thing the manual entry bypassed.

So the manual partner and staff money routes accept a cash drawer and nothing
else. The rule was written for partners and lived in their service; staff had
the same routes and no guard, so the salary form offered bank accounts and the
API took them. Shared now, because the reason has nothing to do with either
feature.

Deliberately *not* applied to the posting functions themselves. The statement
classifier posts through the same ones, with a bank account, and it must —
that is the path this rule exists to send people down.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import entity_context, require_entity_context


def require_manual_cash_payment_account(
    session: Session,
    entity_id: uuid.UUID,
    payment_account_id: uuid.UUID | None,
) -> None:
    """Raise unless the GL account belongs to one of this entity's cash drawers.

    `None` passes: several callers treat a missing account as "accrue only,
    nothing paid yet" rather than as a payment from nowhere.
    """
    if payment_account_id is None:
        return

    from app.core.ledger.posting import InvalidAccountError
    from app.features.banking.models import MoneyAccount, MoneyAccountKind

    with entity_context(session, entity_id):
        require_entity_context()
        money = session.scalar(
            select(MoneyAccount).where(
                MoneyAccount.entity_id == entity_id,
                MoneyAccount.gl_account_id == payment_account_id,
            )
        )
        if money is None:
            raise InvalidAccountError("payment account not found for this entity")
        if money.account_kind != MoneyAccountKind.CASH:
            raise InvalidAccountError(
                "Manual money is cash-only — classify the bank line on the "
                "bank statement instead"
            )
