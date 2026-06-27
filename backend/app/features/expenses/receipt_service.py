"""Expense receipt intake — upload, review, confirm multi-line cash expenses (Phase 8.7)."""

from __future__ import annotations

import hashlib
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.adapters.ocr_ai.expense_receipt import (
    ExpenseReceiptExtractionError,
    ExpenseReceiptUnsupportedError,
    ExpenseReceiptLineExtraction,
    extract_expense_receipt,
    extraction_to_payload,
)
from app.adapters.storage.local import save_upload
from app.core.chart_of_accounts.default_chart import GENERAL_EXPENSE_CODE
from app.core.chart_of_accounts.seed import get_account_by_code
from app.core.expenses.items import InvalidExpenseItemError, resolve_expense_item
from app.core.expenses.posting import InvalidExpensePostingError, _validate_money_account, post_expense_entry
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccountKind
from app.features.entities import service as entity_service
from app.features.expenses.models import (
    ExpenseEntryStatus,
    ExpenseReceiptIntake,
    ExpenseReceiptIntakeStatus,
    ExpenseReceiptLine,
)
from app.features.expenses.schema import (
    ConfirmExpenseReceiptLineRequest,
    ConfirmExpenseReceiptRequest,
    ExpenseReceiptLineRead,
    ExpenseReceiptRead,
    RejectExpenseReceiptRequest,
)


class ExpenseReceiptNotReviewableError(ValueError):
    """Intake is not awaiting review/confirm."""


class DuplicateExpenseReceiptError(Exception):
    def __init__(self, existing: ExpenseReceiptRead) -> None:
        self.existing = existing
        super().__init__("Duplicate expense receipt for this entity")


def _extension_for(filename: str | None, content_type: str | None) -> str:
    if filename:
        lower = filename.lower()
        for ext in (".jpg", ".jpeg", ".png", ".webp", ".pdf", ".txt"):
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
        if "pdf" in lower:
            return ".pdf"
    return ".jpg"


def _validate_cash_money_account(
    session: Session, entity_id: uuid.UUID, money_account_id: uuid.UUID
) -> None:
    money_account = _validate_money_account(session, entity_id, money_account_id)
    if money_account.account_kind != MoneyAccountKind.CASH:
        raise InvalidExpensePostingError("expense receipt payment must be from a cash account")


def _to_line_read(line: ExpenseReceiptLine) -> ExpenseReceiptLineRead:
    return ExpenseReceiptLineRead(
        id=line.id,
        line_order=line.line_order,
        written_item_description=line.written_item_description,
        amount_kurus=line.amount_kurus,
        expense_account_id=line.expense_account_id,
        review_reason=line.review_reason,
        candidate_expense_item_id=line.candidate_expense_item_id,
        expense_entry_id=line.expense_entry_id,
    )


def _to_intake_read(intake: ExpenseReceiptIntake, lines: list[ExpenseReceiptLine]) -> ExpenseReceiptRead:
    return ExpenseReceiptRead(
        id=intake.id,
        entity_id=intake.entity_id,
        status=intake.status,
        file_fingerprint=intake.file_fingerprint,
        source_document_path=intake.source_document_path,
        expense_date=intake.expense_date,
        money_account_id=intake.money_account_id,
        receipt_total_kurus=intake.receipt_total_kurus,
        extraction_payload=intake.extraction_payload,
        review_reason=intake.review_reason,
        actor_id=intake.actor_id,
        posted_at=intake.posted_at,
        lines=[_to_line_read(line) for line in sorted(lines, key=lambda row: row.line_order)],
        created_at=intake.created_at,
    )


def _get_intake_row(
    session: Session, entity_id: uuid.UUID, intake_id: uuid.UUID
) -> tuple[ExpenseReceiptIntake, list[ExpenseReceiptLine]]:
    with entity_context(session, entity_id):
        intake = session.get(ExpenseReceiptIntake, intake_id)
        if intake is None:
            raise LookupError("Expense receipt not found")
        lines = list(
            session.scalars(
                select(ExpenseReceiptLine)
                .where(ExpenseReceiptLine.intake_id == intake.id)
                .order_by(ExpenseReceiptLine.line_order)
            )
        )
        return intake, lines


def _resolve_intake_status_and_reason(
    lines: list[ExpenseReceiptLine],
    *,
    receipt_total_kurus: int | None,
    extraction_failed: bool,
) -> tuple[ExpenseReceiptIntakeStatus, str | None]:
    reasons: list[str] = []
    if extraction_failed:
        reasons.append("Could not read receipt — enter lines manually before posting")
    if not lines:
        reasons.append("No expense lines detected — add items before posting")
    for line in lines:
        if line.amount_kurus <= 0:
            reasons.append(f"Line '{line.written_item_description or '?'}' has no amount")
        if line.review_reason:
            reasons.append(line.review_reason)

    if receipt_total_kurus is not None and lines:
        line_sum = sum(line.amount_kurus for line in lines)
        if line_sum != receipt_total_kurus:
            reasons.append(
                f"Line total ({line_sum}) does not match receipt total ({receipt_total_kurus})"
            )

    if reasons:
        return ExpenseReceiptIntakeStatus.NEEDS_REVIEW, "; ".join(dict.fromkeys(reasons))
    return ExpenseReceiptIntakeStatus.DRAFT, None


def create_expense_receipt_from_upload(
    session: Session,
    entity_id: uuid.UUID,
    content: bytes,
    *,
    money_account_id: uuid.UUID,
    actor_id: uuid.UUID,
    filename: str | None = None,
    content_type: str | None = None,
    tip_only: bool = False,
) -> ExpenseReceiptRead:
    """Upload a daily expense receipt photo → multi-line cash expense intake in Needs Review."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    fingerprint = hashlib.sha256(content).hexdigest()

    with entity_context(session, entity_id):
        require_entity_context()
        existing = session.scalar(
            select(ExpenseReceiptIntake).where(
                ExpenseReceiptIntake.entity_id == entity_id,
                ExpenseReceiptIntake.file_fingerprint == fingerprint,
            )
        )
        if existing is not None:
            _, lines = _get_intake_row(session, entity_id, existing.id)
            raise DuplicateExpenseReceiptError(_to_intake_read(existing, lines))

    general_account = get_account_by_code(session, entity_id, GENERAL_EXPENSE_CODE)
    if general_account is None:
        raise ValueError("Expense accounts not found — seed the chart of accounts")
    general_id = general_account.id

    with entity_context(session, entity_id):
        require_entity_context()
        _validate_cash_money_account(session, entity_id, money_account_id)

    extraction_failed = False
    try:
        extraction = extract_expense_receipt(content)
    except ExpenseReceiptUnsupportedError:
        extraction_failed = True
        from app.adapters.ocr_ai.expense_receipt import ExpenseReceiptExtraction

        extraction = ExpenseReceiptExtraction(
            expense_date=None, lines=[], receipt_total_kurus=None, raw={"source": "unsupported"}
        )
    except ExpenseReceiptExtractionError as exc:
        raise ValueError(str(exc)) from exc

    if tip_only:
        tip_lines = [line for line in extraction.lines if line.is_tip]
        if tip_lines:
            extraction.lines = tip_lines
        else:
            extraction.lines = [
                ExpenseReceiptLineExtraction(
                    description="Bahşiş", amount_kurus=0, is_tip=True
                )
            ]
        extraction.receipt_total_kurus = None

    stored_path = save_upload(
        entity_id,
        fingerprint,
        content,
        extension=_extension_for(filename, content_type),
    )
    payload = extraction_to_payload(extraction)
    payload["stored_path"] = stored_path

    expense_date = extraction.expense_date or date.today()
    draft_rows: list[dict] = []

    with entity_context(session, entity_id):
        require_entity_context()
        for order, item in enumerate(extraction.lines):
            account_id = general_id
            line_review: str | None = None
            candidate_id: uuid.UUID | None = None
            if item.amount_kurus <= 0:
                line_review = "Amount must be positive"
            elif not item.is_tip and item.description.strip():
                resolution = resolve_expense_item(
                    session, entity_id, item.description.strip()
                )
                if resolution.status == ExpenseEntryStatus.NEEDS_REVIEW:
                    line_review = resolution.review_reason
                    candidate_id = resolution.candidate_expense_item_id
            draft_rows.append(
                {
                    "line_order": order,
                    "written_item_description": item.description,
                    "amount_kurus": item.amount_kurus,
                    "expense_account_id": account_id,
                    "review_reason": line_review,
                    "candidate_expense_item_id": candidate_id,
                }
            )

        status, review_reason = _resolve_intake_status_and_reason(
            [
                ExpenseReceiptLine(
                    intake_id=uuid.uuid4(),
                    line_order=row["line_order"],
                    written_item_description=row["written_item_description"],
                    amount_kurus=row["amount_kurus"],
                    expense_account_id=row["expense_account_id"],
                    review_reason=row["review_reason"],
                    candidate_expense_item_id=row["candidate_expense_item_id"],
                )
                for row in draft_rows
            ],
            receipt_total_kurus=extraction.receipt_total_kurus,
            extraction_failed=extraction_failed,
        )
        if extraction_failed and not review_reason:
            review_reason = "Could not read receipt — enter lines manually before posting"
            status = ExpenseReceiptIntakeStatus.NEEDS_REVIEW

        intake = ExpenseReceiptIntake(
            status=status,
            file_fingerprint=fingerprint,
            source_document_path=stored_path,
            expense_date=expense_date,
            money_account_id=money_account_id,
            receipt_total_kurus=extraction.receipt_total_kurus,
            extraction_payload=payload,
            review_reason=review_reason,
            actor_id=actor_id,
        )
        session.add(intake)
        session.flush()

        persisted_lines: list[ExpenseReceiptLine] = []
        for row in draft_rows:
            line = ExpenseReceiptLine(
                intake_id=intake.id,
                line_order=row["line_order"],
                written_item_description=row["written_item_description"],
                amount_kurus=row["amount_kurus"],
                expense_account_id=row["expense_account_id"],
                review_reason=row["review_reason"],
                candidate_expense_item_id=row["candidate_expense_item_id"],
            )
            session.add(line)
            persisted_lines.append(line)

        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            if "uq_expense_receipt_intakes_entity_fingerprint" in str(exc.orig):
                with entity_context(session, entity_id):
                    dup = session.scalar(
                        select(ExpenseReceiptIntake).where(
                            ExpenseReceiptIntake.entity_id == entity_id,
                            ExpenseReceiptIntake.file_fingerprint == fingerprint,
                        )
                    )
                if dup is not None:
                    _, dup_lines = _get_intake_row(session, entity_id, dup.id)
                    raise DuplicateExpenseReceiptError(_to_intake_read(dup, dup_lines)) from exc
            raise
        session.refresh(intake)
        for line in persisted_lines:
            session.refresh(line)

    return _to_intake_read(intake, persisted_lines)


def get_expense_receipt(
    session: Session, entity_id: uuid.UUID, intake_id: uuid.UUID
) -> ExpenseReceiptRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    intake, lines = _get_intake_row(session, entity_id, intake_id)
    return _to_intake_read(intake, lines)


def confirm_expense_receipt(
    session: Session,
    entity_id: uuid.UUID,
    intake_id: uuid.UUID,
    payload: ConfirmExpenseReceiptRequest,
) -> ExpenseReceiptRead:
    """Post all lines atomically — Dr expense / Cr cash per line."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    intake, lines = _get_intake_row(session, entity_id, intake_id)
    if intake.status not in {
        ExpenseReceiptIntakeStatus.DRAFT,
        ExpenseReceiptIntakeStatus.NEEDS_REVIEW,
    }:
        raise ExpenseReceiptNotReviewableError("expense receipt is not awaiting confirm")

    overrides = {item.line_id: item for item in (payload.lines or [])}
    expense_date = payload.expense_date or intake.expense_date
    money_account_id = payload.money_account_id or intake.money_account_id

    with entity_context(session, entity_id):
        require_entity_context()
        _validate_cash_money_account(session, entity_id, money_account_id)

    for line in lines:
        override = overrides.get(line.id)
        if override is not None:
            if override.amount_kurus is not None:
                line.amount_kurus = override.amount_kurus
            if override.written_item_description is not None:
                line.written_item_description = override.written_item_description.strip() or None
            if override.expense_account_id is not None:
                line.expense_account_id = override.expense_account_id

    if not lines:
        raise ExpenseReceiptNotReviewableError("No expense lines to post")

    for line in lines:
        if line.amount_kurus <= 0:
            raise ExpenseReceiptNotReviewableError(
                f"Line '{line.written_item_description or '?'}' needs a positive amount"
            )

    if intake.receipt_total_kurus is not None:
        line_sum = sum(line.amount_kurus for line in lines)
        if line_sum != intake.receipt_total_kurus:
            raise ExpenseReceiptNotReviewableError(
                f"Line total ({line_sum}) does not match receipt total ({intake.receipt_total_kurus})"
            )

    posted_entry_ids: list[uuid.UUID] = []
    try:
        for index, line in enumerate(lines):
            override = overrides.get(line.id)
            confirm_item_id = override.confirm_expense_item_id if override else None
            with entity_context(session, entity_id):
                require_entity_context()
                resolution = resolve_expense_item(
                    session,
                    entity_id,
                    line.written_item_description,
                    confirm_expense_item_id=confirm_item_id,
                )
            if resolution.status != ExpenseEntryStatus.POSTED:
                raise ExpenseReceiptNotReviewableError(
                    resolution.review_reason or "item spelling needs review before posting"
                )

            description = line.written_item_description or "Expense receipt line"
            result = post_expense_entry(
                session,
                entity_id,
                expense_date=expense_date,
                amount_kurus=line.amount_kurus,
                expense_account_id=line.expense_account_id,
                money_account_id=money_account_id,
                description=description,
                actor_id=payload.actor_id,
                written_item_description=line.written_item_description,
                expense_item_id=resolution.expense_item_id,
                has_source_document=True,
                commit=False,
            )
            posted_entry_ids.append(result.expense_entry.id)

            with entity_context(session, entity_id):
                entry = result.expense_entry
                entry.expense_receipt_intake_id = intake.id
                entry.source_document_fingerprint = intake.file_fingerprint
                entry.source_document_path = intake.source_document_path
                line.expense_entry_id = entry.id
                session.flush()

        with entity_context(session, entity_id):
            intake.status = ExpenseReceiptIntakeStatus.POSTED
            intake.expense_date = expense_date
            intake.money_account_id = money_account_id
            intake.review_reason = None
            intake.posted_at = datetime.now(timezone.utc)
            session.commit()
            session.refresh(intake)
            for line in lines:
                session.refresh(line)
    except Exception:
        session.rollback()
        raise

    return _to_intake_read(intake, lines)


def reject_expense_receipt(
    session: Session,
    entity_id: uuid.UUID,
    intake_id: uuid.UUID,
    payload: RejectExpenseReceiptRequest,
) -> ExpenseReceiptRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    intake, lines = _get_intake_row(session, entity_id, intake_id)
    if intake.status in {
        ExpenseReceiptIntakeStatus.POSTED,
        ExpenseReceiptIntakeStatus.REJECTED,
    }:
        raise ExpenseReceiptNotReviewableError("expense receipt cannot be rejected")

    with entity_context(session, entity_id):
        intake.status = ExpenseReceiptIntakeStatus.REJECTED
        intake.review_reason = payload.reason
        session.commit()
        session.refresh(intake)

    return _to_intake_read(intake, lines)
