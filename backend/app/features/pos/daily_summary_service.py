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
    CorrectPosDailySummaryRequest,
    PosDailySummaryListOut,
    PosDailySummaryRead,
    RejectPosDailySummaryRequest,
)
from app.features.pos.settings import is_card_tips_z_report_enabled


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
        z_report_kurus=summary.z_report_kurus,
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


class _NeedsReview:
    """Sentinel signalling the day must go to Needs Review, with a reason."""

    __slots__ = ("reason",)

    def __init__(self, reason: str) -> None:
        self.reason = reason


def _z_mismatch_review_reason(z_value: int, card_kurus: int) -> str:
    """Operator guidance when the card-terminal Z total differs from system card."""
    if z_value > card_kurus:
        gap = z_value - card_kurus
        return (
            f"Z report ({z_value}) exceeds system card ({card_kurus}) by {gap}. "
            "On re-confirm: raise card and lower cash by that amount so card equals Z "
            "(same daily total), record the tip on the expense paper (Dr expense / Cr cash), "
            "then confirm again."
        )
    return (
        f"Z report ({z_value}) is below system card ({card_kurus}). "
        "On re-confirm: adjust cash and card so card equals Z without changing the daily "
        "total, or verify the Z and POS slip figures."
    )


def _resolve_z_report(
    session: Session,
    entity_id: uuid.UUID,
    summary: PosDailySummary,
    payload: ConfirmPosDailySummaryRequest,
    card_kurus: int,
) -> tuple[int | None, None | _NeedsReview]:
    """Reconcile card-terminal Z report to system card sale (per-entity).

    When Z tracking is enabled, Z must equal the system card sale before posting.
    Any mismatch routes to Needs Review so the owner corrects figures or records
    tips on the expense list — the app does not derive or post tips at POS.
    """
    if not is_card_tips_z_report_enabled(session, entity_id):
        return None, None

    z_value = (
        payload.z_report_kurus
        if payload.z_report_kurus is not None
        else summary.z_report_kurus
    )
    if z_value is None:
        return None, _NeedsReview(
            "Z report required — enter the card-terminal Z total for this day"
        )

    if card_kurus == 0 and z_value > 0:
        return z_value, _NeedsReview(
            "Z report entered but there is no card sale for this day"
        )

    if z_value != card_kurus:
        return z_value, _NeedsReview(_z_mismatch_review_reason(z_value, card_kurus))

    return z_value, None


def _flag_needs_review(
    session: Session,
    entity_id: uuid.UUID,
    summary: PosDailySummary,
    z_report_kurus: int | None,
    reason: str,
) -> PosDailySummaryRead:
    with entity_context(session, entity_id):
        summary.status = PosDailySummaryStatus.NEEDS_REVIEW
        summary.review_reason = reason
        if z_report_kurus is not None:
            summary.z_report_kurus = z_report_kurus
        session.commit()
        session.refresh(summary)
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

    z_report_kurus, z_review = _resolve_z_report(
        session, entity_id, summary, payload, card_kurus
    )
    if isinstance(z_review, _NeedsReview):
        return _flag_needs_review(
            session, entity_id, summary, z_report_kurus, z_review.reason
        )

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
            z_report_kurus=z_report_kurus,
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


def create_manual_daily_sales(
    session: Session,
    entity_id: uuid.UUID,
    payload,
) -> PosDailySummaryRead:
    """Typed cash + card daily sales without a POS photo — posts via shared confirm path."""
    from app.features.pos.schema import ConfirmPosDailySummaryRequest, ManualDailySalesRequest

    if not isinstance(payload, ManualDailySalesRequest):
        payload = ManualDailySalesRequest.model_validate(payload)

    _require_entity(session, entity_id)

    if payload.cash_kurus == 0 and payload.card_kurus == 0:
        raise PosDailySummaryConfirmError("at least one of cash or card must be positive")

    total_kurus = payload.cash_kurus + payload.card_kurus

    if _find_posted_summary_for_date(session, entity_id, payload.sales_date) is not None:
        raise PosDailySummaryConfirmError(_duplicate_date_review_reason(payload.sales_date))

    fingerprint = f"manual:{uuid.uuid4()}"
    with entity_context(session, entity_id):
        summary = PosDailySummary(
            status=PosDailySummaryStatus.DRAFT,
            file_fingerprint=fingerprint,
            summary_date=payload.sales_date,
            cash_kurus=payload.cash_kurus,
            card_kurus=payload.card_kurus,
            total_kurus=total_kurus,
            z_report_kurus=payload.z_report_kurus,
            extraction_payload={"source": "manual_daily_sales"},
            review_reason=None,
            money_account_id=payload.money_account_id,
        )
        session.add(summary)
        session.commit()
        session.refresh(summary)

    confirm_payload = ConfirmPosDailySummaryRequest(
        money_account_id=payload.money_account_id,
        actor_id=payload.actor_id,
        cash_kurus=payload.cash_kurus,
        card_kurus=payload.card_kurus,
        summary_date=payload.sales_date,
        description=payload.description or "Manual daily sales",
        z_report_kurus=payload.z_report_kurus,
    )
    return confirm_pos_daily_summary_intake(session, entity_id, summary.id, confirm_payload)


def assert_sales_date_available(
    session: Session,
    entity_id: uuid.UUID,
    sales_date: date,
) -> None:
    """Raise if a posted daily summary already exists for this date."""
    if _find_posted_summary_for_date(session, entity_id, sales_date) is not None:
        raise PosDailySummaryConfirmError(_duplicate_date_review_reason(sales_date))


def validate_z_report_before_post(
    session: Session,
    entity_id: uuid.UUID,
    *,
    sales_date: date,
    cash_kurus: int,
    card_kurus: int,
    z_report_kurus: int | None,
) -> int | None:
    """Validate Z-report rules; raise PosDailySummaryConfirmError on mismatch."""
    stub = PosDailySummary(
        status=PosDailySummaryStatus.DRAFT,
        file_fingerprint="z-check",
        summary_date=sales_date,
        cash_kurus=cash_kurus,
        card_kurus=card_kurus,
        total_kurus=cash_kurus + card_kurus,
        z_report_kurus=z_report_kurus,
    )
    payload = ConfirmPosDailySummaryRequest(
        money_account_id=uuid.UUID(int=0),
        actor_id=uuid.UUID(int=0),
        cash_kurus=cash_kurus,
        card_kurus=card_kurus,
        summary_date=sales_date,
        z_report_kurus=z_report_kurus,
    )
    resolved_z, z_review = _resolve_z_report(
        session, entity_id, stub, payload, card_kurus
    )
    if isinstance(z_review, _NeedsReview):
        raise PosDailySummaryConfirmError(z_review.reason)
    return resolved_z


def correct_pos_daily_summary_intake(
    session: Session,
    entity_id: uuid.UUID,
    summary_id: uuid.UUID,
    payload: CorrectPosDailySummaryRequest,
) -> PosDailySummaryRead:
    """Correct a posted daily summary — void linked JEs and repost with new figures."""
    from app.core.ledger.correction import (
        PosDailySummaryCorrectionError,
        correct_pos_daily_summary,
    )

    _require_entity(session, entity_id)
    summary = _get_summary_row(session, entity_id, summary_id)
    status = PosDailySummaryStatus(summary.status)

    if status != PosDailySummaryStatus.POSTED:
        raise PosDailySummaryImmutableError(
            f"Summary status {status.value!r} cannot be corrected"
        )

    sales_date = payload.summary_date or summary.summary_date or date.today()
    cash_kurus = (
        payload.cash_kurus
        if payload.cash_kurus is not None
        else summary.confirmed_cash_kurus or summary.cash_kurus
    )
    card_kurus = (
        payload.card_kurus
        if payload.card_kurus is not None
        else summary.confirmed_card_kurus or summary.card_kurus
    )

    if _find_posted_summary_for_date(
        session, entity_id, sales_date, exclude_id=summary.id
    ) is not None:
        raise PosDailySummaryConfirmError(_duplicate_date_review_reason(sales_date))

    effective_total = cash_kurus + card_kurus
    if not math_valid(cash_kurus, card_kurus, effective_total):
        raise PosDailySummaryConfirmError(
            "cash + card must equal total — provide consistent amounts"
        )

    z_report_kurus, z_review = _resolve_z_report(
        session, entity_id, summary, payload, card_kurus
    )
    if isinstance(z_review, _NeedsReview):
        raise PosDailySummaryConfirmError(z_review.reason)

    description = payload.description or "POS daily summary"

    try:
        result = correct_pos_daily_summary(
            session,
            entity_id,
            summary,
            money_account_id=payload.money_account_id,
            cash_kurus=cash_kurus,
            card_kurus=card_kurus,
            summary_date=sales_date,
            actor_id=payload.actor_id,
            description=description,
            z_report_kurus=z_report_kurus,
            reason=payload.reason,
            void_date=payload.void_date,
            period_unlock_reason=payload.period_unlock_reason,
        )
    except PosDailySummaryCorrectionError as exc:
        raise PosDailySummaryImmutableError(str(exc)) from exc
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
