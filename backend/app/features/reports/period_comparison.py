"""Period-over-period comparison report (Phase 7 Slice 6)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.features.dashboard import service as dashboard_service
from app.features.delivery.settings import is_delivery_enabled
from app.features.entities import service as entity_service
from app.features.reports import cash_flow
from app.features.reports import financial_statements
from app.features.reports import kdv_input
from app.features.reports import service as reports_service
from app.features.reports.schema import PeriodComparisonRead, PeriodMetricComparison
from app.features.reports.service import InvalidDateRangeError

__all__ = ["get_period_comparison"]

_METRIC_LABELS: dict[str, str] = {
    "total_sales_kurus": "Total sales",
    "cash_sales_kurus": "Cash sales",
    "pos_card_sales_kurus": "POS card sales",
    "delivery_sales_kurus": "Delivery sales",
    "total_expenses_kurus": "Total expenses",
    "net_result_kurus": "Net result",
    "net_income_kurus": "Net income",
    "total_input_vat_kurus": "Total input VAT",
    "delivery_gross_kurus": "Delivery gross sales",
    "cash_flow_net_change_kurus": "Cash flow net change",
}


def _require_entity(session: Session, entity_id: uuid.UUID) -> None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")


def _prior_period(from_date: date, to_date: date) -> tuple[date, date]:
    period_days = (to_date - from_date).days + 1
    prior_to = from_date - timedelta(days=1)
    prior_from = prior_to - timedelta(days=period_days - 1)
    return prior_from, prior_to


def _compare_metric(
    key: str,
    label: str,
    current: int,
    prior: int,
) -> PeriodMetricComparison:
    change_kurus = current - prior
    change_percent: float | None = None
    if prior != 0:
        change_percent = round((change_kurus / prior) * 100, 2)
    return PeriodMetricComparison(
        key=key,
        label=label,
        current_kurus=current,
        prior_kurus=prior,
        change_kurus=change_kurus,
        change_percent=change_percent,
    )


def _window_metrics(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    *,
    delivery_enabled: bool,
) -> dict[str, int]:
    dashboard = dashboard_service.get_dashboard(
        session, entity_id, from_date, to_date
    )
    profit_and_loss = financial_statements.get_profit_and_loss(
        session, entity_id, from_date, to_date
    )
    kdv_report = kdv_input.get_kdv_input_report(
        session, entity_id, from_date, to_date
    )
    cash_flow_report = cash_flow.get_cash_flow(
        session, entity_id, from_date, to_date
    )

    metrics: dict[str, int] = {
        "total_sales_kurus": dashboard.sales.total_sales_kurus,
        "cash_sales_kurus": dashboard.sales.cash_sales_kurus,
        "pos_card_sales_kurus": dashboard.sales.pos_card_sales_kurus,
        "delivery_sales_kurus": dashboard.sales.delivery_sales_kurus,
        "total_expenses_kurus": dashboard.total_expenses_kurus,
        "net_result_kurus": dashboard.net_result_kurus,
        "net_income_kurus": profit_and_loss.net_income_kurus,
        "total_input_vat_kurus": kdv_report.total_vat_kurus,
        "cash_flow_net_change_kurus": cash_flow_report.net_change_kurus,
    }

    if delivery_enabled:
        delivery_report = reports_service.get_delivery_sales_report(
            session, entity_id, from_date, to_date
        )
        metrics["delivery_gross_kurus"] = delivery_report.total_gross_kurus

    return metrics


def get_period_comparison(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    *,
    prior_from: date | None = None,
    prior_to: date | None = None,
) -> PeriodComparisonRead:
    if from_date > to_date:
        raise InvalidDateRangeError("from must be on or before to")

    if (prior_from is None) != (prior_to is None):
        raise InvalidDateRangeError(
            "prior_from and prior_to must both be provided or both omitted"
        )

    if prior_from is not None and prior_to is not None and prior_from > prior_to:
        raise InvalidDateRangeError("prior_from must be on or before prior_to")

    _require_entity(session, entity_id)

    if prior_from is None or prior_to is None:
        prior_from, prior_to = _prior_period(from_date, to_date)
    else:
        assert prior_from is not None and prior_to is not None

    delivery_enabled = is_delivery_enabled(session, entity_id)

    current_metrics = _window_metrics(
        session,
        entity_id,
        from_date,
        to_date,
        delivery_enabled=delivery_enabled,
    )
    prior_metrics = _window_metrics(
        session,
        entity_id,
        prior_from,
        prior_to,
        delivery_enabled=delivery_enabled,
    )

    metric_keys = list(_METRIC_LABELS)
    if not delivery_enabled:
        metric_keys = [key for key in metric_keys if key != "delivery_gross_kurus"]

    comparisons = [
        _compare_metric(
            key,
            _METRIC_LABELS[key],
            current_metrics[key],
            prior_metrics[key],
        )
        for key in metric_keys
    ]

    return PeriodComparisonRead(
        entity_id=entity_id,
        current_from=from_date,
        current_to=to_date,
        prior_from=prior_from,
        prior_to=prior_to,
        metrics=comparisons,
    )
