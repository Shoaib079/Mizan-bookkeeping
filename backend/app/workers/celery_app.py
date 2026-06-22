"""Celery application — scheduled backups via Redis broker (Phase 8)."""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery("mizan")
celery_app.conf.update(
    broker_url=settings.celery_broker_url,
    result_backend=settings.celery_result_backend,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "daily-backup": {
            "task": "backups.run_daily_backup",
            "schedule": crontab(
                minute=settings.backup_schedule_minute,
                hour=settings.backup_schedule_hour,
            ),
        },
    },
)
celery_app.autodiscover_tasks(["app.features.backups"])
