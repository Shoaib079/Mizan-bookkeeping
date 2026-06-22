"""Celery tasks for scheduled backups (Phase 8)."""

from __future__ import annotations

from app.features.backups import service
from app.workers.celery_app import celery_app


@celery_app.task(name="backups.run_daily_backup")
def run_daily_backup() -> dict:
    result = service.run_backup()
    verify = service.verify_latest_backup()
    pruned = service.prune_old_backups()
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
