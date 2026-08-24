"""Sales summary — cash / card / delivery totals for a period (read-only).

Posted 4000 credits by JE source only. Group sales (4300) are never included.
Prior column is always the full calendar month before the selected range's
start month (owner: mid-month still wants last month WHOLE, not same-length).
"""

from __future__ import annotations

import calendar
import uuid
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntrySource
from app.db.session import entity_context
from app.features.dashboard import service as dashboard_service
from app.features.delivery.settings import is_delivery_enabled
from app.features.entities import service as entity_service
from app.features.reports.schema import SalesSummaryColumnRead, SalesSummaryRead
from app.features.reports.service import InvalidDateRangeError

__all__ = [
    "full_calendar_month_before",
    "get_sales_summary",
]


def _require_entity(session: Session, entity_id: uuid.UUID) -> None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")


def full_calendar_month_before(anchor: date) -> tuple[date, date]:
    """Full calendar month before the month that contains `anchor`.

    On 24 Aug 2026 → 1 Jul 2026 … 31 Jul 2026 (not 1–24 Jul).
    """
    first_of_anchor_month = anchor.replace(day=1)
    prior_last = first_of_anchor_month - timedelta(days=1)
    prior_first = prior_last.replace(day=1)
    return prior_first, prior_last


def _column_totals(
    session: Session,
    *,
    from_date: date,
    to_date: date,
) -> tuple[int, int, int, int]:
    """Cash + card + delivery on 4000; total = sum of the three."""
    sales_account_id, _group_id = dashboard_service.sales_revenue_account_ids(session)
    by_source = dashboard_service.period_revenue_credits(
        session,
        account_id=sales_account_id,
        from_date=from_date,
        to_date=to_date,
    )
    cash = int(by_source.get(JournalEntrySource.CASH_MOVEMENT, 0))
    card = int(by_source.get(JournalEntrySource.CARD_SALES, 0))
    delivery = int(by_source.get(JournalEntrySource.DELIVERY_REPORT, 0))
    return cash, card, delivery, cash + card + delivery


def _column(
    session: Session,
    *,
    from_date: date,
    to_date: date,
    full_month: bool,
) -> SalesSummaryColumnRead:
    cash, card, delivery, total = _column_totals(
        session, from_date=from_date, to_date=to_date
    )
    return SalesSummaryColumnRead(
        from_date=from_date,
        to_date=to_date,
        full_month=full_month,
        cash_kurus=cash,
        card_kurus=card,
        delivery_kurus=delivery,
        total_kurus=total,
    )


def get_sales_summary(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
) -> SalesSummaryRead:
    if from_date > to_date:
        raise InvalidDateRangeError("from_date must be on or before to_date")
    _require_entity(session, entity_id)
    with entity_context(session, entity_id):
        prior_from, prior_to = full_calendar_month_before(from_date)
        current_full = (
            from_date.day == 1
            and (from_date.year, from_date.month) == (to_date.year, to_date.month)
            and to_date.day
            == calendar.monthrange(to_date.year, to_date.month)[1]
        )
        return SalesSummaryRead(
            entity_id=entity_id,
            delivery_enabled=is_delivery_enabled(session, entity_id),
            current=_column(
                session,
                from_date=from_date,
                to_date=to_date,
                full_month=current_full,
            ),
            prior=_column(
                session,
                from_date=prior_from,
                to_date=prior_to,
                full_month=True,
            ),
        )
