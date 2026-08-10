"""Correcting and voiding a delivery platform's commission invoice.

Lifted verbatim from `correction.py` when it was split.

A commission invoice is an invoice like any other — an e-Fatura from a
platform, reviewed with the rest. The only structural difference is where the
credit goes: a supplier invoice credits payables, a commission credits the
platform's clearing account, so there is no supplier subledger row to reverse
and the correction is the GL plus the draft.

It was void-only for months because nobody had written the correction, not
because correcting it is unsound — and the ledger's action resolver had no
branch for it either, so a wrong commission was in the books with no way out.
"""

from __future__ import annotations

from app.core.chart_of_accounts.models import Account
from app.core.ledger.correction.drafts import _delivery_commission_draft, _release_posted_draft
from app.core.ledger.correction.machinery import SubledgerCorrectionResult, SubledgerVoidResult, correct_gl_with_subledger_rows, void_gl_with_subledger_rows
from app.core.ledger.correction.registry import CorrectionNotFoundError
from app.core.ledger.models import JournalEntry
from app.core.ledger.posting import InvalidAccountError
from app.db.session import entity_context, require_entity_context
from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import Session
import uuid


def correct_delivery_commission_invoice(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    invoice_date: date,
    description: str,
    actor_id: uuid.UUID,
    expense_account_id: uuid.UUID,
    net_kurus: int,
    gross_kurus: int,
    vat_breakdown: list,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerCorrectionResult:
    """Correct a posted delivery commission invoice.

    The last invoice type that could only be voided and re-entered. It is an
    invoice like any other — an e-Fatura from a platform, reviewed with the
    rest — and it was void-only because nobody had written this, not because
    correcting it is unsound.

    Simpler than `correct_supplier_invoice`: a commission credits the
    platform's clearing account rather than payables, so there is no supplier
    subledger row to reverse and re-create. Only the GL lines and the draft.

    The clearing account comes from the platform on the *draft*, not from the
    old journal lines. Re-deriving it means a correction posts where a fresh
    invoice would, rather than inheriting an account that may since have been
    changed on the platform.
    """
    from app.core.chart_of_accounts.default_chart import INPUT_VAT_CODE
    from app.core.delivery.commission_posting import (
        build_delivery_commission_posting_lines,
    )
    from app.features.delivery import platform_service

    with entity_context(session, entity_id):
        require_entity_context()
        draft = _delivery_commission_draft(session, journal_entry_id)
        if draft.delivery_platform_id is None:
            raise CorrectionNotFoundError(
                "delivery commission has no platform linked"
            )

        platform = platform_service.get_delivery_platform_row(
            session, entity_id, draft.delivery_platform_id
        )
        clearing_account = session.get(Account, platform.gl_account_id)
        if clearing_account is None:
            raise InvalidAccountError("platform clearing account not found")
        input_vat = session.scalar(select(Account).where(Account.code == INPUT_VAT_CODE))
        if input_vat is None:
            raise InvalidAccountError(f"input VAT account {INPUT_VAT_CODE} not found")

        lines = build_delivery_commission_posting_lines(
            expense_account_id=expense_account_id,
            clearing_account_id=clearing_account.id,
            input_vat_account_id=input_vat.id,
            net_kurus=net_kurus,
            gross_kurus=gross_kurus,
            vat_breakdown=vat_breakdown,
        )

        def update_draft(sess: Session, corrected: JournalEntry) -> None:
            # The draft has to follow the entry, or the invoice screen keeps
            # showing the figures that were replaced and the KDV report reads
            # the old breakdown — both silently.
            draft.journal_entry_id = corrected.id
            draft.net_kurus = net_kurus
            draft.gross_kurus = gross_kurus
            draft.vat_breakdown = vat_breakdown
            draft.invoice_date = invoice_date
            sess.flush()

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        invoice_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        update_mutable=update_draft,
    )


def void_delivery_commission_invoice(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    """Take a posted delivery commission back out of the books."""
    with entity_context(session, entity_id):
        require_entity_context()
        draft = _delivery_commission_draft(session, journal_entry_id)

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        after_gl=_release_posted_draft(draft),
    )
