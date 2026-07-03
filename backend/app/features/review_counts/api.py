"""Review queue count HTTP routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth.deps import member_read_guard
from app.db.session import get_session
from app.features.review_counts import service as review_counts_service
from app.features.review_counts.schema import ReviewCountsRead

router = APIRouter(prefix="/entities/{entity_id}/review-counts", tags=["review"])


@router.get("", response_model=ReviewCountsRead)
def get_review_counts(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> ReviewCountsRead:
    try:
        return review_counts_service.get_review_counts(session, entity_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
