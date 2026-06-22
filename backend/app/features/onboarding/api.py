"""Onboarding API — validate and post opening balances (Decisions §19)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.onboarding.posting import (
    AlreadyPostedError,
    ChartNotSeededError,
    OpeningBalancePostError,
    post_opening_balances,
)
from app.db.session import entity_context, get_session
from app.features.entities import service as entity_service
from app.features.onboarding.opening_balances import (
    OpeningBalanceError,
    OpeningBalanceLineInput,
    build_day_one_journal,
)
from app.features.onboarding.schema import (
    ONBOARDING_WIZARD_STEPS,
    JournalLineOut,
    OpeningBalancePostRequest,
    OpeningBalancePostResponse,
    OpeningBalanceValidateRequest,
    OpeningBalanceValidateResponse,
    PartnerLedgerEntryOut,
    SupplierLedgerEntryOut,
    CustomerLedgerEntryOut,
)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


def _line_inputs(payload_lines) -> list[OpeningBalanceLineInput]:
    return [
        OpeningBalanceLineInput(
            account_code=line.account_code,
            money_account_id=line.money_account_id,
            supplier_id=line.supplier_id,
            partner_id=line.partner_id,
            customer_id=line.customer_id,
            amount_kurus=line.amount_kurus,
            side=line.side,
        )
        for line in payload_lines
    ]


def _journal_lines_out(journal) -> list[JournalLineOut]:
    return [
        JournalLineOut(
            account_code=jl.account_code,
            amount_kurus=jl.amount_kurus,
            side=jl.side,
        )
        for jl in journal
    ]


@router.get("/wizard-steps")
def list_wizard_steps() -> list[str]:
    return [step.value for step in ONBOARDING_WIZARD_STEPS]


@router.post(
    "/entities/{entity_id}/opening-balances/validate",
    response_model=OpeningBalanceValidateResponse,
)
def validate_opening_balances(
    entity_id: uuid.UUID,
    payload: OpeningBalanceValidateRequest,
    session: Session = Depends(get_session),
) -> OpeningBalanceValidateResponse:
    if entity_service.get_entity(session, entity_id) is None:
        raise HTTPException(status_code=404, detail="Entity not found")

    try:
        lines = _line_inputs(payload.lines)
        journal = build_day_one_journal(session, entity_id, lines)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OpeningBalanceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return OpeningBalanceValidateResponse(
        valid=True,
        journal_lines=_journal_lines_out(journal),
        message="Opening balances balance; day-one journal draft is ready to post.",
    )


@router.post(
    "/entities/{entity_id}/opening-balances/post",
    response_model=OpeningBalancePostResponse,
)
def post_opening_balances_api(
    entity_id: uuid.UUID,
    payload: OpeningBalancePostRequest,
    session: Session = Depends(get_session),
) -> OpeningBalancePostResponse:
    if entity_service.get_entity(session, entity_id) is None:
        raise HTTPException(status_code=404, detail="Entity not found")

    try:
        result = post_opening_balances(
            session,
            entity_id,
            go_live_date=payload.go_live_date,
            lines=_line_inputs(payload.lines),
            actor_id=payload.actor_id,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AlreadyPostedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ChartNotSeededError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OpeningBalanceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OpeningBalancePostError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    with entity_context(session, entity_id):
        journal_lines = []
        for line in result.journal_entry.lines:
            account = session.get(Account, line.account_id)
            assert account is not None
            journal_lines.append(
                JournalLineOut(
                    account_code=account.code,
                    amount_kurus=line.amount_kurus,
                    side=line.side,
                )
            )

    return OpeningBalancePostResponse(
        journal_entry_id=result.journal_entry.id,
        journal_lines=journal_lines,
        supplier_ledger_entries=[
            SupplierLedgerEntryOut(id=entry.id, supplier_id=entry.supplier_id)
            for entry in result.supplier_ledger_entries
        ],
        partner_ledger_entries=[
            PartnerLedgerEntryOut(id=entry.id, partner_id=entry.partner_id)
            for entry in result.partner_ledger_entries
        ],
        customer_ledger_entries=[
            CustomerLedgerEntryOut(id=entry.id, customer_id=entry.customer_id)
            for entry in result.customer_ledger_entries
        ],
        go_live_date=payload.go_live_date,
    )
