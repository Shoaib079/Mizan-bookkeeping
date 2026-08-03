"""HTTP routes for owner-triggered backups."""

from __future__ import annotations

import logging
import time
import uuid

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth.deps import require_admin_members
from app.db.session import get_session
from app.features.auth.models import User
from app.features.backups.schema import BackupEnqueueResult, BackupTaskStatus
from app.features.backups.tasks import run_manual_backup
from app.features.entities import service as entity_service
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/entities/{entity_id}/backups",
    tags=["backups"],
)

# Soft debounce so double-clicks do not stack pg_dump jobs.
_MANUAL_DEBOUNCE_SECONDS = 60.0
_last_manual_enqueue_monotonic: float | None = None


@router.post("/run", response_model=BackupEnqueueResult, status_code=202)
def enqueue_manual_backup(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(require_admin_members),
) -> BackupEnqueueResult:
    global _last_manual_enqueue_monotonic

    if entity_service.get_entity(session, entity_id) is None:
        raise HTTPException(status_code=404, detail="Entity not found")

    now = time.monotonic()
    if (
        _last_manual_enqueue_monotonic is not None
        and now - _last_manual_enqueue_monotonic < _MANUAL_DEBOUNCE_SECONDS
    ):
        raise HTTPException(
            status_code=429,
            detail="A backup was just started — wait a minute before starting another.",
        )

    try:
        async_result = run_manual_backup.delay()
    except Exception as exc:
        logger.exception("failed to enqueue manual backup")
        raise HTTPException(
            status_code=503,
            detail="Backup worker unavailable — try again later or use the nightly schedule.",
        ) from exc

    _last_manual_enqueue_monotonic = now
    return BackupEnqueueResult(task_id=async_result.id)


@router.get("/run/{task_id}", response_model=BackupTaskStatus)
def manual_backup_status(
    entity_id: uuid.UUID,
    task_id: str,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(require_admin_members),
) -> BackupTaskStatus:
    if entity_service.get_entity(session, entity_id) is None:
        raise HTTPException(status_code=404, detail="Entity not found")

    result = AsyncResult(task_id, app=celery_app)
    state = (result.state or "PENDING").upper()

    if state in {"PENDING", "RECEIVED", "STARTED", "RETRY"}:
        return BackupTaskStatus(status="pending", task_id=task_id)

    if state == "SUCCESS":
        payload = result.result if isinstance(result.result, dict) else {}
        return BackupTaskStatus(
            status="success",
            task_id=task_id,
            artifact_key=payload.get("artifact_key"),
            timestamp=payload.get("timestamp"),
            message="Backup uploaded to Cloudflare R2",
        )

    # FAILURE / REVOKED / other
    error = result.result
    message = str(error) if error else f"Backup failed ({state})"
    return BackupTaskStatus(status="failed", task_id=task_id, message=message)
