"""Entity dashboard aggregation — read-only orchestration (Decisions §23)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import GROUP_SALES_REVENUE_CODE, SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.fx.ledger import native_quantity_balance, try_cost_balance_kurus
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource, JournalEntryStatus
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.banking import service as banking_service
from app.features.dashboard.schema import (
    DashboardRead,
    DeliveryBalanceLeftRow,
    FxBalanceRow,
    NeedsReviewBreakdown,
    PayablePreviewRow,
    PeriodSalesRead,
)
from app.features.delivery import service as delivery_service
from app.features.delivery.models import DeliveryReport, DeliveryReportStatus
from app.features.delivery.settings import is_delivery_enabled
from app.features.entities import service as entity_service
from app.features.expenses.models import ExpenseEntry, ExpenseEntryStatus
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus
from app.features.banking.statement_models import BankStatementLine, StatementLineStatus
from app.features.payables import service as payables_service
from app.features.pos.models import PosDailySummary, PosDailySummaryStatus
from app.features.receivables import service as receivables_service
from app.features.reports import service as reports_service
from app.features.reports.service import InvalidDateRangeError

__all__ = ["InvalidDateRangeError", "get_dashboard"]


def _require_entity(session: Session, entity_id: uuid.UUID) -> None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")


def _sales_revenue_account_ids(session: Session) -> tuple[uuid.UUID, uuid.UUID]:
    rows = session.execute(
        select(Account.id, Account.code).where(
            Account.code.in_((SALES_REVENUE_CODE, GROUP_SALES_REVENUE_CODE))
        )
    ).all()
    by_code = {code: account_id for account_id, code in rows}
    if SALES_REVENUE_CODE not in by_code:
        raise LookupError("Sales revenue account not found")
    if GROUP_SALES_REVENUE_CODE not in by_code:
        raise LookupError("Group sales revenue account not found")
    return by_code[SALES_REVENUE_CODE], by_code[GROUP_SALES_REVENUE_CODE]


def _period_revenue_credits(
    session: Session,
    *,
    account_id: uuid.UUID,
    from_date: date,
    to_date: date,
) -> dict[JournalEntrySource, int]:
    rows = session.execute(
        select(
            JournalEntry.source,
            func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0),
        )
        .join(JournalEntryLine, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .where(
            JournalEntry.status == JournalEntryStatus.POSTED.value,
            JournalEntry.entry_date >= from_date,
            JournalEntry.entry_date <= to_date,
            JournalEntryLine.account_id == account_id,
            JournalEntryLine.side == AccountNormalBalance.CREDIT,
        )
        .group_by(JournalEntry.source)
    ).all()
    return {JournalEntrySource(source): int(total) for source, total in rows}


def _build_period_sales(
    session: Session,
    *,
    from_date: date,
    to_date: date,
) -> PeriodSalesRead:
    sales_account_id, group_account_id = _sales_revenue_account_ids(session)
    by_source = _period_revenue_credits(
        session, account_id=sales_account_id, from_date=from_date, to_date=to_date
    )
    group_by_source = _period_revenue_credits(
        session, account_id=group_account_id, from_date=from_date, to_date=to_date
    )
    cash_sales = by_source.get(JournalEntrySource.CASH_MOVEMENT, 0)
    card_sales = by_source.get(JournalEntrySource.CARD_SALES, 0)
    delivery_sales = by_source.get(JournalEntrySource.DELIVERY_REPORT, 0)
    classified = {
        JournalEntrySource.CASH_MOVEMENT,
        JournalEntrySource.CARD_SALES,
        JournalEntrySource.DELIVERY_REPORT,
    }
    other_sales = sum(
        amount for source, amount in by_source.items() if source not in classified
    )
    group_sales = sum(group_by_source.values())
    total_sales = cash_sales + card_sales + delivery_sales + other_sales + group_sales
    return PeriodSalesRead(
        cash_sales_kurus=cash_sales,
        pos_card_sales_kurus=card_sales,
        delivery_sales_kurus=delivery_sales,
        group_sales_kurus=group_sales,
        other_sales_kurus=other_sales,
        total_sales_kurus=total_sales,
    )


def _period_expenses_kurus(
    session: Session,
    *,
    from_date: date,
    to_date: date,
    expense_account_id: uuid.UUID | None,
) -> int:
    query = (
        select(func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0))
        .select_from(JournalEntryLine)
        .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
        .join(Account, Account.id == JournalEntryLine.account_id)
        .where(
            JournalEntry.status == JournalEntryStatus.POSTED.value,
            JournalEntry.entry_date >= from_date,
            JournalEntry.entry_date <= to_date,
            Account.account_type == AccountType.EXPENSE,
            JournalEntryLine.side == AccountNormalBalance.DEBIT,
        )
    )
    if expense_account_id is not None:
        query = query.where(JournalEntryLine.account_id == expense_account_id)
    return int(session.scalar(query) or 0)


def _payables_preview(
    rows: list[tuple],
    *,
    supplier_id: uuid.UUID | None,
    limit: int = 5,
) -> list[PayablePreviewRow]:
    balances = [
        PayablePreviewRow(
            supplier_id=supplier.id,
            supplier_name=supplier.name,
            balance_kurus=balance,
        )
        for supplier, balance in rows
    ]
    if supplier_id is not None:
        return [row for row in balances if row.supplier_id == supplier_id]

    balances.sort(key=lambda row: row.balance_kurus, reverse=True)
    return balances[:limit]


def _try_money_position_kurus(
    session: Session,
    *,
    money_account_id: uuid.UUID | None,
) -> int:
    query = select(MoneyAccount).where(
        MoneyAccount.is_active.is_(True),
        MoneyAccount.account_kind.in_(
            (MoneyAccountKind.BANK, MoneyAccountKind.CASH),
        ),
    )
    if money_account_id is not None:
        query = query.where(MoneyAccount.id == money_account_id)

    total = 0
    for money_account in session.scalars(query.order_by(MoneyAccount.name)):
        gl_account = session.get(Account, money_account.gl_account_id)
        if gl_account is None:
            continue
        total += banking_service.gl_balance_kurus(
            session,
            gl_account.id,
            gl_account.normal_balance,
        )
    return total


def _fx_balances(session: Session) -> list[FxBalanceRow]:
    rows: list[FxBalanceRow] = []
    for money_account in session.scalars(
        select(MoneyAccount)
        .where(
            MoneyAccount.is_active.is_(True),
            MoneyAccount.account_kind == MoneyAccountKind.FOREIGN_CURRENCY,
        )
        .order_by(MoneyAccount.name)
    ):
        if money_account.currency is None:
            continue
        rows.append(
            FxBalanceRow(
                money_account_id=money_account.id,
                name=money_account.name,
                currency=money_account.currency,
                native_quantity=native_quantity_balance(
                    session, money_account.entity_id, money_account.id
                ),
                try_cost_kurus=try_cost_balance_kurus(
                    session, money_account.entity_id, money_account.id
                ),
            )
        )
    return rows


def _needs_review_counts(
    session: Session,
    *,
    delivery_enabled: bool,
) -> NeedsReviewBreakdown:
    invoice_drafts = int(
        session.scalar(
            select(func.count())
            .select_from(InvoiceDraft)
            .where(InvoiceDraft.status == InvoiceDraftStatus.NEEDS_REVIEW.value)
        )
        or 0
    )
    invoice_duplicates = int(
        session.scalar(
            select(func.count())
            .select_from(InvoiceDraft)
            .where(InvoiceDraft.status == InvoiceDraftStatus.DUPLICATE.value)
        )
        or 0
    )
    bank_statement_lines = int(
        session.scalar(
            select(func.count())
            .select_from(BankStatementLine)
            .where(BankStatementLine.status == StatementLineStatus.NEEDS_REVIEW)
        )
        or 0
    )
    pos_daily_summaries = int(
        session.scalar(
            select(func.count())
            .select_from(PosDailySummary)
            .where(PosDailySummary.status == PosDailySummaryStatus.NEEDS_REVIEW.value)
        )
        or 0
    )
    expense_entries = int(
        session.scalar(
            select(func.count())
            .select_from(ExpenseEntry)
            .where(ExpenseEntry.status == ExpenseEntryStatus.NEEDS_REVIEW)
        )
        or 0
    )
    delivery_reports = 0
    if delivery_enabled:
        delivery_reports = int(
            session.scalar(
                select(func.count())
                .select_from(DeliveryReport)
                .where(DeliveryReport.status == DeliveryReportStatus.NEEDS_REVIEW.value)
            )
            or 0
        )

    total = (
        invoice_drafts
        + invoice_duplicates
        + bank_statement_lines
        + pos_daily_summaries
        + delivery_reports
        + expense_entries
    )
    return NeedsReviewBreakdown(
        invoice_drafts=invoice_drafts,
        invoice_duplicates=invoice_duplicates,
        bank_statement_lines=bank_statement_lines,
        pos_daily_summaries=pos_daily_summaries,
        delivery_reports=delivery_reports,
        expense_entries=expense_entries,
        total=total,
    )


def _confirmed_invoice_draft_count(session: Session) -> int:
    return int(
        session.scalar(
            select(func.count())
            .select_from(InvoiceDraft)
            .where(InvoiceDraft.status == InvoiceDraftStatus.CONFIRMED.value)
        )
        or 0
    )


def get_dashboard(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    *,
    supplier_id: uuid.UUID | None = None,
    money_account_id: uuid.UUID | None = None,
    expense_account_id: uuid.UUID | None = None,
) -> DashboardRead:
    if from_date > to_date:
        raise InvalidDateRangeError("from must be on or before to")

    _require_entity(session, entity_id)
    delivery_enabled = is_delivery_enabled(session, entity_id)

    with entity_context(session, entity_id):
        require_entity_context()

        sales = _build_period_sales(session, from_date=from_date, to_date=to_date)
        total_expenses = _period_expenses_kurus(
            session,
            from_date=from_date,
            to_date=to_date,
            expense_account_id=expense_account_id,
        )
        needs_review = _needs_review_counts(session, delivery_enabled=delivery_enabled)
        confirmed_invoice_drafts = _confirmed_invoice_draft_count(session)
        total_try_position = _try_money_position_kurus(
            session, money_account_id=money_account_id
        )
        fx_balances = _fx_balances(session)

    delivery_platforms: list = []
    delivery_balance_left: list[DeliveryBalanceLeftRow] = []
    if delivery_enabled:
        delivery_report = reports_service.get_delivery_sales_report(
            session, entity_id, from_date, to_date
        )
        delivery_platforms = delivery_report.platforms
        clearing = delivery_service.get_delivery_clearing_reconciliation(
            session, entity_id
        )
        delivery_balance_left = [
            DeliveryBalanceLeftRow(
                delivery_platform_id=row.delivery_platform_id,
                platform_name=row.platform_name,
                balance_left_kurus=row.balance_left_kurus,
            )
            for row in clearing.platforms
            if row.balance_left_kurus != 0
        ]

    total_payables, payable_rows, _ = payables_service.list_payables(session, entity_id)
    total_receivables, _, _ = receivables_service.list_receivables(session, entity_id)

    return DashboardRead(
        entity_id=entity_id,
        from_date=from_date,
        to_date=to_date,
        sales=sales,
        delivery_platforms=delivery_platforms,
        total_expenses_kurus=total_expenses,
        net_result_kurus=sales.total_sales_kurus - total_expenses,
        total_payables_kurus=total_payables,
        payables_preview=_payables_preview(payable_rows, supplier_id=supplier_id),
        total_receivables_kurus=total_receivables,
        delivery_balance_left=delivery_balance_left,
        total_try_position_kurus=total_try_position,
        fx_balances=fx_balances,
        tax_department_payments_kurus=None,
        needs_review=needs_review,
        confirmed_invoice_drafts=confirmed_invoice_drafts,
    )
