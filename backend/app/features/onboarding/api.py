"""Onboarding API — validate opening balances before Phase 1 posting."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.features.entities import service as entity_service
from app.features.onboarding.opening_balances import (
    OpeningBalanceError,
    OpeningBalanceLine,
    build_day_one_journal,
)
from app.features.onboarding.schema import (
    ONBOARDING_WIZARD_STEPS,
    JournalLineOut,
    OpeningBalanceValidateRequest,
    OpeningBalanceValidateResponse,
)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


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

    lines = [
        OpeningBalanceLine(
            account_code=line.account_code,
            amount_kurus=line.amount_kurus,
            side=line.side,
        )
        for line in payload.lines
    ]
    try:
        journal = build_day_one_journal(lines)
    except OpeningBalanceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return OpeningBalanceValidateResponse(
        valid=True,
        journal_lines=[
            JournalLineOut(
                account_code=jl.account_code,
                amount_kurus=jl.amount_kurus,
                side=jl.side,
            )
            for jl in journal
        ],
        message="Opening balances balance; day-one journal draft is ready for Phase 1 posting.",
    )
