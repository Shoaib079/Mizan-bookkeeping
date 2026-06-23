"""Partner feature service — master data + posting wrappers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.core.partners import posting as partner_posting
from app.core.partners.ledger import current_balance_kurus, list_ledger_entries
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.partners.models import Partner
from app.features.partners.schema import (
    ExpenseFrontedCreate,
    ExpenseFrontedResponse,
    PartnerCreate,
    PartnerLedgerEntryRead,
    PartnerLedgerRead,
    PartnerUpdate,
    ReimbursementPaidCreate,
    ReimbursementPaidResponse,
)


def create_partner(
    session: Session, entity_id: uuid.UUID, payload: PartnerCreate
) -> Partner:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        partner = Partner(
            name=payload.name,
            notes=payload.notes,
        )
        session.add(partner)
        session.commit()
        session.refresh(partner)
        return partner


def list_partners(
    session: Session,
    entity_id: uuid.UUID,
    *,
    include_inactive: bool = False,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[Partner], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if not include_inactive:
            filters.append(Partner.is_active.is_(True))
        search = text_search_filter(q, Partner.name)
        if search is not None:
            filters.append(search)
        stmt = select(Partner).where(*filters).order_by(Partner.name)
        return fetch_paginated(session, stmt, params)


def get_partner(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> Partner:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        partner = session.get(Partner, partner_id)
        if partner is None:
            raise LookupError("Partner not found")
        return partner


def update_partner(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: PartnerUpdate,
) -> Partner:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        partner = session.get(Partner, partner_id)
        if partner is None:
            raise LookupError("Partner not found")

        if payload.name is not None:
            partner.name = payload.name
        if payload.notes is not None:
            partner.notes = payload.notes
        if payload.is_active is not None:
            partner.is_active = payload.is_active

        session.commit()
        session.refresh(partner)
        return partner


def get_partner_ledger(
    session: Session, entity_id: uuid.UUID, partner_id: uuid.UUID
) -> PartnerLedgerRead:
    balance = current_balance_kurus(session, entity_id, partner_id)
    entries = list_ledger_entries(session, entity_id, partner_id)
    return PartnerLedgerRead(
        partner_id=partner_id,
        balance_kurus=balance,
        entries=[PartnerLedgerEntryRead.model_validate(e) for e in entries],
    )


def record_expense_fronted(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: ExpenseFrontedCreate,
) -> ExpenseFrontedResponse:
    result = partner_posting.post_expense_fronted(
        session,
        entity_id,
        partner_id,
        expense_date=payload.expense_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        expense_account_id=payload.expense_account_id,
    )
    return ExpenseFrontedResponse(
        journal_entry_id=result.journal_entry.id,
        partner_ledger_entry=PartnerLedgerEntryRead.model_validate(
            result.partner_ledger_entry
        ),
        balance_kurus=result.balance_kurus,
    )


def record_reimbursement_paid(
    session: Session,
    entity_id: uuid.UUID,
    partner_id: uuid.UUID,
    payload: ReimbursementPaidCreate,
) -> ReimbursementPaidResponse:
    result = partner_posting.post_reimbursement_paid(
        session,
        entity_id,
        partner_id,
        payment_date=payload.payment_date,
        amount_kurus=payload.amount_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        payment_account_id=payload.payment_account_id,
    )
    return ReimbursementPaidResponse(
        journal_entry_id=result.journal_entry.id,
        partner_ledger_entry=PartnerLedgerEntryRead.model_validate(
            result.partner_ledger_entry
        ),
        balance_kurus=result.balance_kurus,
    )
