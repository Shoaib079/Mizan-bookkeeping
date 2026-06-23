"""POS daily-summary intake — upload, review, confirm posting (Decisions §9)."""

from __future__ import annotations

import hashlib
import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.adapters.ocr_ai.pos_summary import (
    PosSummaryExtractionError,
    PosSummaryUnsupportedError,
    extract_pos_summary,
    extraction_to_payload,
    math_valid,
)
from app.adapters.storage.local import save_upload
from app.core.pos.daily_summary_posting import (
    PosDailySummaryPostError,
    confirm_pos_daily_summary,
)
from app.db.session import entity_context
from app.core.listing import ListParams, date_range_filters, fetch_paginated
from app.features.entities import service as entity_service
from app.features.pos.models import PosDailySummary, PosDailySummaryStatus
from app.features.pos.schema import (
    ConfirmPosDailySummaryRequest,
    PosDailySummaryListOut,
    PosDailySummaryRead,
    RejectPosDailySummaryRequest,
)


class DuplicatePosDailySummaryError(Exception):
    def __init__(self, existing: PosDailySummary) -> None:
        self.existing = existing
        super().__init__("Duplicate POS daily-summary document for this entity")


class PosDailySummaryConfirmError(Exception):
    """Raised when summary cannot be confirmed/posted."""


class PosDailySummaryImmutableError(Exception):
    """Raised when a posted/rejected summary is modified."""


def file_fingerprint(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _require_entity(session: Session, entity_id: uuid.UUID) -> None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")


def _to_read(summary: PosDailySummary) -> PosDailySummaryRead:
    return PosDailySummaryRead(
        id=summary.id,
        entity_id=summary.entity_id,
        status=PosDailySummaryStatus(summary.status),
        file_fingerprint=summary.file_fingerprint,
        summary_date=summary.summary_date,
        cash_kurus=summary.cash_kurus,
        card_kurus=summary.card_kurus,
        total_kurus=summary.total_kurus,
        confirmed_cash_kurus=summary.confirmed_cash_kurus,
        confirmed_card_kurus=summary.confirmed_card_kurus,
        extraction_payload=summary.extraction_payload,
        review_reason=summary.review_reason,
        money_account_id=summary.money_account_id,
        confirmed_at=summary.confirmed_at,
        confirmed_by=summary.confirmed_by,
        posted_at=summary.posted_at,
        posted_by=summary.posted_by,
        card_sales_batch_id=summary.card_sales_batch_id,
        cash_movement_id=summary.cash_movement_id,
        created_at=summary.created_at,
    )


def _get_summary_row(
    session: Session, entity_id: uuid.UUID, summary_id: uuid.UUID
) -> PosDailySummary:
    with entity_context(session, entity_id):
        summary = session.get(PosDailySummary, summary_id)
        if summary is None:
            raise LookupError("POS daily summary not found")
        return summary


def _find_by_fingerprint(
    session: Session, entity_id: uuid.UUID, fingerprint: str
) -> PosDailySummary | None:
    with entity_context(session, entity_id):
        return session.scalar(
            select(PosDailySummary).where(PosDailySummary.file_fingerprint == fingerprint)
        )


def _format_summary_date_tr(summary_date: date) -> str:
    return summary_date.strftime("%d.%m")


def _duplicate_date_review_reason(summary_date: date) -> str:
    return f"A summary for {_format_summary_date_tr(summary_date)} already exists"


def _find_active_summary_for_date(
    session: Session,
    entity_id: uuid.UUID,
    summary_date: date,
    *,
    exclude_id: uuid.UUID | None = None,
) -> PosDailySummary | None:
    """Another non-rejected summary for the same business day."""
    with entity_context(session, entity_id):
        query = select(PosDailySummary).where(
            PosDailySummary.summary_date == summary_date,
            PosDailySummary.status != PosDailySummaryStatus.REJECTED.value,
        )
        if exclude_id is not None:
            query = query.where(PosDailySummary.id != exclude_id)
        return session.scalar(query.limit(1))


def _find_posted_summary_for_date(
    session: Session,
    entity_id: uuid.UUID,
    summary_date: date,
    *,
    exclude_id: uuid.UUID | None = None,
) -> PosDailySummary | None:
    with entity_context(session, entity_id):
        query = select(PosDailySummary).where(
            PosDailySummary.summary_date == summary_date,
            PosDailySummary.status == PosDailySummaryStatus.POSTED.value,
        )
        if exclude_id is not None:
            query = query.where(PosDailySummary.id != exclude_id)
        return session.scalar(query.limit(1))


def _extension_for(filename: str | None, content_type: str | None) -> str:
    if filename:
        lower = filename.lower()
        for ext in (".jpg", ".jpeg", ".png", ".webp", ".txt"):
            if lower.endswith(ext):
                return ext
    if content_type:
        lower = content_type.lower()
        if "jpeg" in lower or "jpg" in lower:
            return ".jpg"
        if "png" in lower:
            return ".png"
        if "webp" in lower:
            return ".webp"
    return ".jpg"


def create_pos_daily_summary_from_upload(
    session: Session,
    entity_id: uuid.UUID,
    content: bytes,
    *,
    filename: str | None = None,
    content_type: str | None = None,
) -> PosDailySummaryRead:
    _require_entity(session, entity_id)

    fingerprint = file_fingerprint(content)
    existing = _find_by_fingerprint(session, entity_id, fingerprint)
    if existing is not None:
        raise DuplicatePosDailySummaryError(existing)

    try:
        extraction = extract_pos_summary(content)
    except PosSummaryUnsupportedError:
        raise
    except PosSummaryExtractionError as exc:
        raise ValueError(str(exc)) from exc

    if math_valid(extraction.cash_kurus, extraction.card_kurus, extraction.total_kurus):
        status = PosDailySummaryStatus.DRAFT
        review_reason = None
    else:
        status = PosDailySummaryStatus.NEEDS_REVIEW
        review_reason = (
            f"cash ({extraction.cash_kurus}) + card ({extraction.card_kurus}) "
            f"!= total ({extraction.total_kurus})"
        )

    if extraction.summary_date is not None:
        duplicate = _find_active_summary_for_date(
            session, entity_id, extraction.summary_date
        )
        if duplicate is not None:
            status = PosDailySummaryStatus.NEEDS_REVIEW
            dup_reason = _duplicate_date_review_reason(extraction.summary_date)
            review_reason = (
                dup_reason
                if review_reason is None
                else f"{review_reason}; {dup_reason}"
            )

    stored_path = save_upload(
        entity_id,
        fingerprint,
        content,
        extension=_extension_for(filename, content_type),
    )
    payload = extraction_to_payload(extraction)
    payload["stored_path"] = stored_path

    with entity_context(session, entity_id):
        summary = PosDailySummary(
            status=status,
            file_fingerprint=fingerprint,
            summary_date=extraction.summary_date,
            cash_kurus=extraction.cash_kurus,
            card_kurus=extraction.card_kurus,
            total_kurus=extraction.total_kurus,
            extraction_payload=payload,
            review_reason=review_reason,
        )
        session.add(summary)
        session.commit()
        session.refresh(summary)

    return _to_read(summary)


def list_pos_daily_summaries(
    session: Session,
    entity_id: uuid.UUID,
    *,
    status: PosDailySummaryStatus | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[PosDailySummaryRead], int]:
    _require_entity(session, entity_id)
    params = list_params or ListParams()

    with entity_context(session, entity_id):
        filters = []
        if status is not None:
            filters.append(PosDailySummary.status == status)
        filters.extend(
            date_range_filters(
                PosDailySummary.summary_date, from_date=from_date, to_date=to_date
            )
        )
        stmt = (
            select(PosDailySummary)
            .where(*filters)
            .order_by(
                PosDailySummary.created_at.desc(),
                PosDailySummary.summary_date.desc(),
            )
        )
        summaries, total = fetch_paginated(session, stmt, params)

    return [_to_read(summary) for summary in summaries], total


def get_pos_daily_summary(
    session: Session, entity_id: uuid.UUID, summary_id: uuid.UUID
) -> PosDailySummaryRead:
    _require_entity(session, entity_id)
    summary = _get_summary_row(session, entity_id, summary_id)
    return _to_read(summary)


def confirm_pos_daily_summary_intake(
    session: Session,
    entity_id: uuid.UUID,
    summary_id: uuid.UUID,
    payload: ConfirmPosDailySummaryRequest,
) -> PosDailySummaryRead:
    _require_entity(session, entity_id)
    summary = _get_summary_row(session, entity_id, summary_id)
    status = PosDailySummaryStatus(summary.status)

    if status in {PosDailySummaryStatus.POSTED, PosDailySummaryStatus.REJECTED}:
        raise PosDailySummaryImmutableError(
            f"Summary status {status.value!r} cannot be confirmed"
        )

    sales_date = payload.summary_date or summary.summary_date or date.today()
    if _find_posted_summary_for_date(
        session, entity_id, sales_date, exclude_id=summary.id
    ) is not None:
        raise PosDailySummaryConfirmError(_duplicate_date_review_reason(sales_date))

    cash_kurus = (
        payload.cash_kurus if payload.cash_kurus is not None else summary.cash_kurus
    )
    card_kurus = (
        payload.card_kurus if payload.card_kurus is not None else summary.card_kurus
    )

    if status == PosDailySummaryStatus.NEEDS_REVIEW:
        if payload.cash_kurus is None or payload.card_kurus is None:
            raise PosDailySummaryConfirmError(
                "Math mismatch — provide corrected cash_kurus and card_kurus on confirm"
            )

    effective_total = cash_kurus + card_kurus
    if not math_valid(cash_kurus, card_kurus, summary.total_kurus):
        if status == PosDailySummaryStatus.NEEDS_REVIEW:
            with entity_context(session, entity_id):
                summary.total_kurus = effective_total
                session.flush()
        else:
            raise PosDailySummaryConfirmError(
                "cash + card must equal total — correct amounts or reject"
            )

    sales_date = payload.summary_date or summary.summary_date or date.today()
    description = payload.description or "POS daily summary"

    with entity_context(session, entity_id):
        if summary.summary_date is None:
            summary.summary_date = sales_date
        session.flush()

    try:
        result = confirm_pos_daily_summary(
            session,
            entity_id,
            summary,
            money_account_id=payload.money_account_id,
            cash_kurus=cash_kurus,
            card_kurus=card_kurus,
            actor_id=payload.actor_id,
            description=description,
        )
    except PosDailySummaryPostError as exc:
        raise PosDailySummaryConfirmError(str(exc)) from exc
    except IntegrityError as exc:
        session.rollback()
        if "uq_pos_daily_summaries_entity_date_posted" in str(exc.orig):
            raise PosDailySummaryConfirmError(
                _duplicate_date_review_reason(sales_date)
            ) from exc
        raise

    return _to_read(result.summary)


def reject_pos_daily_summary(
    session: Session,
    entity_id: uuid.UUID,
    summary_id: uuid.UUID,
    *,
    payload: RejectPosDailySummaryRequest,
) -> PosDailySummaryRead:
    _require_entity(session, entity_id)
    summary = _get_summary_row(session, entity_id, summary_id)
    status = PosDailySummaryStatus(summary.status)

    if status in {PosDailySummaryStatus.POSTED, PosDailySummaryStatus.REJECTED}:
        raise PosDailySummaryImmutableError(
            f"Summary status {status.value!r} cannot be rejected"
        )

    with entity_context(session, entity_id):
        summary.status = PosDailySummaryStatus.REJECTED
        summary.review_reason = payload.reason
        session.commit()
        session.refresh(summary)

    return _to_read(summary)
