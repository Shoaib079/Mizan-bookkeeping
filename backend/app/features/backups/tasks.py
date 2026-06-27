"""Celery tasks for scheduled backups (Phase 8)."""

from __future__ import annotations

import logging

from app.features.backups import service
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="backups.run_daily_backup", bind=True)
def run_daily_backup(self) -> dict:
    try:
        result = service.run_backup()
        verify = service.verify_latest_backup()
        pruned = service.prune_old_backups()
    except Exception:
        logger.exception(
            "daily backup task failed (backup/verify/prune); task_id=%s",
            self.request.id,
        )
        raise
    logger.info(
        "daily backup completed artifact=%s verified=%s pruned=%d",
        result.artifact_key,
        verify.checks_passed,
        len(pruned),
    )
    return {
        "artifact_key": result.artifact_key,
        "timestamp": result.timestamp,
        "verified": verify.checks_passed,
        "pruned": pruned,
    }


@celery_app.task(name="backups.verify_latest")
def verify_latest_backup_task() -> dict:
    result = service.verify_latest_backup()
    return result.model_dump()


@celery_app.task(name="backups.prune")
def prune_backups_task() -> dict:
    return {"pruned": service.prune_old_backups()}
