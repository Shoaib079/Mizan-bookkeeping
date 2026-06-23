"""SQLAlchemy helpers for paginated, searchable list queries."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.expenses.normalize import normalize_expense_item_text
from app.core.listing.params import ListParams


def turkish_fold_sql(column: ColumnElement[Any]) -> ColumnElement[Any]:
    """Mirror ``normalize_expense_item_text`` folding in SQL (I→ı, İ→i, then lower)."""
    folded = func.replace(column, "İ", "i")
    folded = func.replace(folded, "I", "ı")
    return func.lower(folded)


def text_search_filter(
    q: str | None,
    *columns: ColumnElement[Any],
) -> ColumnElement[bool] | None:
    """Case-insensitive Turkish-aware substring match on text columns."""
    if q is None or not q.strip():
        return None
    normalized = normalize_expense_item_text(q)
    if not normalized:
        return None
    pattern = f"%{normalized}%"
    clauses = [turkish_fold_sql(column).like(pattern) for column in columns]
    if len(clauses) == 1:
        return clauses[0]
    return or_(*clauses)


def normalized_text_search_filter(
    q: str | None,
    normalized_column: ColumnElement[Any],
) -> ColumnElement[bool] | None:
    """Substring match on a pre-normalized column (expense items)."""
    if q is None or not q.strip():
        return None
    normalized = normalize_expense_item_text(q)
    if not normalized:
        return None
    return normalized_column.contains(normalized)


def date_range_filters(
    column: ColumnElement[Any],
    *,
    from_date: date | None,
    to_date: date | None,
) -> list[ColumnElement[bool]]:
    clauses: list[ColumnElement[bool]] = []
    if from_date is not None:
        clauses.append(column >= from_date)
    if to_date is not None:
        clauses.append(column <= to_date)
    return clauses


def amount_range_filters(
    column: ColumnElement[Any],
    *,
    min_amount: int | None,
    max_amount: int | None,
) -> list[ColumnElement[bool]]:
    clauses: list[ColumnElement[bool]] = []
    if min_amount is not None:
        clauses.append(column >= min_amount)
    if max_amount is not None:
        clauses.append(column <= max_amount)
    return clauses


def apply_list_window(stmt: Select[Any], params: ListParams) -> Select[Any]:
    return stmt.limit(params.limit).offset(params.offset)


def count_rows(session: Session, stmt: Select[Any]) -> int:
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    return session.scalar(count_stmt) or 0


def fetch_paginated(
    session: Session,
    stmt: Select[Any],
    params: ListParams,
) -> tuple[list[Any], int]:
    total = count_rows(session, stmt)
    rows = list(session.scalars(apply_list_window(stmt, params)).all())
    return rows, total


def fetch_paginated_rows(
    session: Session,
    stmt: Select[Any],
    params: ListParams,
) -> tuple[list[Any], int]:
    total = count_rows(session, stmt)
    rows = list(session.execute(apply_list_window(stmt, params)).all())
    return rows, total
