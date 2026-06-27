"""Atomic day close-out — manual sales + N expenses in one transaction (Slice 11.15)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.core.expenses.items import resolve_expense_item
from app.core.expenses.posting import (
    InvalidExpensePostingError,
    post_expense_entry,
    _validate_expense_account,
)
from app.core.ledger.posting import InvalidAccountError, PostingError
from app.core.pos.daily_summary_posting import (
    PosDailySummaryPostError,
    confirm_pos_daily_summary,
)
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.expenses.models import ExpenseEntryStatus
from app.features.operations.schema import (
    DayCloseoutExpensePosted,
    DayCloseoutRead,
    DayCloseoutRequest,
)
from app.features.pos import daily_summary_service
from app.features.pos.models import PosDailySummary, PosDailySummaryStatus


class DayCloseoutError(ValueError):
    """Day close-out validation or posting failed — transaction rolled back."""


def post_day_closeout(
    session: Session,
    entity_id: uuid.UUID,
    payload: DayCloseoutRequest,
) -> DayCloseoutRead:
    """Post manual daily sales and expense lines atomically (single commit)."""
    if not isinstance(payload, DayCloseoutRequest):
        payload = DayCloseoutRequest.model_validate(payload)

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    if payload.cash_kurus == 0 and payload.card_kurus == 0:
        raise DayCloseoutError("at least one of cash or card must be positive")

    try:
        daily_summary_service.assert_sales_date_available(
            session, entity_id, payload.sales_date
        )
    except daily_summary_service.PosDailySummaryConfirmError as exc:
        raise DayCloseoutError(str(exc)) from exc

    total_kurus = payload.cash_kurus + payload.card_kurus
    sales_description = payload.description or "Day close-out sales"

    try:
        z_report_kurus = daily_summary_service.validate_z_report_before_post(
            session,
            entity_id,
            sales_date=payload.sales_date,
            cash_kurus=payload.cash_kurus,
            card_kurus=payload.card_kurus,
            z_report_kurus=payload.z_report_kurus,
        )
    except daily_summary_service.PosDailySummaryConfirmError as exc:
        raise DayCloseoutError(str(exc)) from exc

    with entity_context(session, entity_id):
        require_entity_context()

        for line in payload.expense_lines:
            written = (line.item_description or "").strip() or None
            try:
                _validate_expense_account(
                    session, entity_id, line.expense_account_id
                )
            except InvalidAccountError as exc:
                raise DayCloseoutError(str(exc)) from exc
            resolution = resolve_expense_item(
                session,
                entity_id,
                written,
            )
            if resolution.status == ExpenseEntryStatus.NEEDS_REVIEW:
                raise DayCloseoutError(
                    resolution.review_reason
                    or "expense item needs review — resolve before day close-out"
                )

        summary = PosDailySummary(
            status=PosDailySummaryStatus.DRAFT,
            file_fingerprint=f"closeout:{uuid.uuid4()}",
            summary_date=payload.sales_date,
            cash_kurus=payload.cash_kurus,
            card_kurus=payload.card_kurus,
            total_kurus=total_kurus,
            z_report_kurus=payload.z_report_kurus,
            extraction_payload={"source": "day_closeout"},
            review_reason=None,
            money_account_id=payload.money_account_id,
        )
        session.add(summary)
        session.flush()

        try:
            sales_result = confirm_pos_daily_summary(
                session,
                entity_id,
                summary,
                money_account_id=payload.money_account_id,
                cash_kurus=payload.cash_kurus,
                card_kurus=payload.card_kurus,
                actor_id=payload.actor_id,
                description=sales_description,
                z_report_kurus=z_report_kurus,
                period_unlock_reason=payload.period_unlock_reason,
                commit=False,
            )
        except (PosDailySummaryPostError, PostingError) as exc:
            session.rollback()
            raise DayCloseoutError(str(exc)) from exc

        posted_expenses: list[DayCloseoutExpensePosted] = []
        for line in payload.expense_lines:
            written = (line.item_description or "").strip() or None
            item_label = written or "Expense"
            description = f"Day close-out — {item_label}"
            resolution = resolve_expense_item(
                session,
                entity_id,
                written,
            )
            try:
                expense_result = post_expense_entry(
                    session,
                    entity_id,
                    expense_date=payload.sales_date,
                    amount_kurus=line.amount_kurus,
                    expense_account_id=line.expense_account_id,
                    money_account_id=payload.money_account_id,
                    description=description,
                    actor_id=payload.actor_id,
                    written_item_description=written,
                    expense_item_id=resolution.expense_item_id,
                    has_source_document=False,
                    period_unlock_reason=payload.period_unlock_reason,
                    commit=False,
                )
            except (
                InvalidExpensePostingError,
                InvalidAccountError,
                ValueError,
                PostingError,
            ) as exc:
                session.rollback()
                raise DayCloseoutError(str(exc)) from exc

            posted_expenses.append(
                DayCloseoutExpensePosted(
                    expense_id=expense_result.expense_entry.id,
                    journal_entry_id=expense_result.journal_entry.id,
                )
            )

        session.commit()
        session.refresh(sales_result.summary)

        return DayCloseoutRead(
            pos_daily_summary_id=sales_result.summary.id,
            pos_daily_summary_status=PosDailySummaryStatus(
                sales_result.summary.status
            ).value,
            card_journal_entry_id=(
                sales_result.card_journal_entry.id
                if sales_result.card_journal_entry is not None
                else None
            ),
            cash_journal_entry_id=(
                sales_result.cash_journal_entry.id
                if sales_result.cash_journal_entry is not None
                else None
            ),
            expenses=posted_expenses,
        )
