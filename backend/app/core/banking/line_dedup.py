"""Bank statement line dedup — same movement across overlapping exports."""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.expenses.normalize import normalize_expense_item_text
from app.features.banking.statement_models import BankStatement, BankStatementLine


def statement_line_dedup_key(
    money_account_id: uuid.UUID,
    *,
    transaction_date: date,
    amount_kurus: int,
    description: str,
    reference: str | None,
) -> str:
    """Stable key per bank account + transaction (description is bank-fixed)."""
    normalized = normalize_expense_item_text(description)
    ref = normalize_expense_item_text(reference or "")
    payload = (
        f"{money_account_id}|{transaction_date.isoformat()}|{amount_kurus}|"
        f"{normalized}|{ref}"
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class LineImportPlan:
    transaction_date: date
    amount_kurus: int
    description: str
    reference: str | None
    dedup_key: str
    skip_duplicate: bool
    needs_review: bool
    review_reason: str | None


def _amount_date_key(
    money_account_id: uuid.UUID,
    transaction_date: date,
    amount_kurus: int,
) -> str:
    return f"{money_account_id}|{transaction_date.isoformat()}|{amount_kurus}"


def plan_statement_line_imports(
    session: Session,
    money_account_id: uuid.UUID,
    rows: list[tuple[date, int, str, str | None]],
) -> list[LineImportPlan]:
    """Classify parsed rows: import, skip exact duplicate, or flag ambiguous match."""
    existing = list(
        session.scalars(
            select(BankStatementLine)
            .join(BankStatement, BankStatementLine.statement_id == BankStatement.id)
            .where(BankStatement.money_account_id == money_account_id)
        )
    )
    by_dedup_key: dict[str, BankStatementLine] = {
        line.dedup_key: line for line in existing if line.dedup_key
    }
    by_amount_date: dict[str, list[BankStatementLine]] = {}
    for line in existing:
        if not line.dedup_key:
            continue
        key = _amount_date_key(money_account_id, line.transaction_date, line.amount_kurus)
        by_amount_date.setdefault(key, []).append(line)

    plans: list[LineImportPlan] = []
    seen_in_file: set[str] = set()

    for transaction_date, amount_kurus, description, reference in rows:
        dedup_key = statement_line_dedup_key(
            money_account_id,
            transaction_date=transaction_date,
            amount_kurus=amount_kurus,
            description=description,
            reference=reference,
        )

        if dedup_key in seen_in_file or dedup_key in by_dedup_key:
            plans.append(
                LineImportPlan(
                    transaction_date=transaction_date,
                    amount_kurus=amount_kurus,
                    description=description,
                    reference=reference,
                    dedup_key=dedup_key,
                    skip_duplicate=True,
                    needs_review=False,
                    review_reason=None,
                )
            )
            continue

        amount_date_key = _amount_date_key(
            money_account_id, transaction_date, amount_kurus
        )
        siblings = by_amount_date.get(amount_date_key, [])
        ambiguous = any(line.dedup_key != dedup_key for line in siblings)
        review_reason = None
        needs_review = False
        if ambiguous:
            needs_review = True
            review_reason = (
                "Same date and amount as an existing statement line with a different "
                "description — confirm this is not a duplicate"
            )

        plans.append(
            LineImportPlan(
                transaction_date=transaction_date,
                amount_kurus=amount_kurus,
                description=description,
                reference=reference,
                dedup_key=dedup_key,
                skip_duplicate=False,
                needs_review=needs_review,
                review_reason=review_reason,
            )
        )
        seen_in_file.add(dedup_key)

    return plans
