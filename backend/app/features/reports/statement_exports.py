"""P&L / balance-sheet downloads that honour the on-screen sealed vs live view.

The screen already passes ``view`` into the read routes. Exports used to omit
it and always served the default (sealed for a closed month), so Download
could disagree with what the page showed. One path: same ``get_*`` service,
same ``view``, then stamp the file and the filename so a Downloads folder
still says which world the numbers came from.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.core.period_locks import snapshot as period_snapshot
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.reports import excel_export, financial_statements, pdf_export


def figures_label(source: str) -> str:
    return "As closed" if source == financial_statements.VIEW_AS_CLOSED else "Live"


def figures_filename_suffix(source: str, *, period_closed: bool) -> str | None:
    """Filename suffix; open months keep today's no-suffix convention."""
    if source == financial_statements.VIEW_AS_CLOSED:
        return "as-closed"
    if period_closed:
        return "live"
    return None


def _period_closed(
    session: Session,
    entity_id: uuid.UUID,
    *,
    period_start: date,
    period_end: date,
) -> bool:
    with entity_context(session, entity_id):
        require_entity_context()
        return (
            period_snapshot.active_month_lock(
                session, period_start=period_start, period_end=period_end
            )
            is not None
        )


def _entity_name(session: Session, entity_id: uuid.UUID) -> str:
    entity = entity_service.get_entity(session, entity_id)
    if entity is None:
        raise LookupError("Entity not found")
    return entity.name


def profit_and_loss_xlsx(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    *,
    view: str,
) -> tuple[bytes, str]:
    report = financial_statements.get_profit_and_loss(
        session, entity_id, from_date, to_date, view=view
    )
    closed = _period_closed(
        session, entity_id, period_start=from_date, period_end=to_date
    )
    data = excel_export.build_profit_and_loss_xlsx(
        report, figures_label=figures_label(report.source)
    )
    filename = excel_export.export_filename(
        "profit-and-loss",
        entity_name=_entity_name(session, entity_id),
        from_date=from_date,
        to_date=to_date,
        figures_suffix=figures_filename_suffix(report.source, period_closed=closed),
    )
    return data, filename


def profit_and_loss_pdf(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    *,
    view: str,
) -> tuple[bytes, str]:
    entity_name = _entity_name(session, entity_id)
    report = financial_statements.get_profit_and_loss(
        session, entity_id, from_date, to_date, view=view
    )
    closed = _period_closed(
        session, entity_id, period_start=from_date, period_end=to_date
    )
    data = pdf_export.build_profit_and_loss_pdf(
        report, entity_name, figures_label=figures_label(report.source)
    )
    filename = excel_export.export_filename(
        "profit-and-loss",
        entity_name=entity_name,
        from_date=from_date,
        to_date=to_date,
        figures_suffix=figures_filename_suffix(report.source, period_closed=closed),
        extension=".pdf",
    )
    return data, filename


def balance_sheet_xlsx(
    session: Session,
    entity_id: uuid.UUID,
    as_of: date,
    *,
    view: str,
) -> tuple[bytes, str]:
    report = financial_statements.get_balance_sheet(
        session, entity_id, as_of, view=view
    )
    month_start = as_of.replace(day=1)
    closed = _period_closed(
        session, entity_id, period_start=month_start, period_end=as_of
    )
    data = excel_export.build_balance_sheet_xlsx(
        report, figures_label=figures_label(report.source)
    )
    filename = excel_export.export_filename(
        "balance-sheet",
        entity_name=_entity_name(session, entity_id),
        as_of=as_of,
        figures_suffix=figures_filename_suffix(report.source, period_closed=closed),
    )
    return data, filename


def balance_sheet_pdf(
    session: Session,
    entity_id: uuid.UUID,
    as_of: date,
    *,
    view: str,
) -> tuple[bytes, str]:
    entity_name = _entity_name(session, entity_id)
    report = financial_statements.get_balance_sheet(
        session, entity_id, as_of, view=view
    )
    month_start = as_of.replace(day=1)
    closed = _period_closed(
        session, entity_id, period_start=month_start, period_end=as_of
    )
    data = pdf_export.build_balance_sheet_pdf(
        report, entity_name, figures_label=figures_label(report.source)
    )
    filename = excel_export.export_filename(
        "balance-sheet",
        entity_name=entity_name,
        as_of=as_of,
        figures_suffix=figures_filename_suffix(report.source, period_closed=closed),
        extension=".pdf",
    )
    return data, filename
