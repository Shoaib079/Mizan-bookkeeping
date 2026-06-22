"""Application settings — DATABASE_URL and environment (Phase 0).

Set ``AUTH_ENFORCEMENT=true`` in production to require ``X-User-Id`` and
enforce per-entity permissions on guarded routes.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://mizan:mizan_dev@localhost:5432/mizan"
    test_database_url: str = "postgresql+psycopg://mizan:mizan_dev@localhost:5432/mizan_test"
    database_admin_url: str = "postgresql+psycopg://postgres@localhost:5432/postgres"
    upload_dir: str = "data/uploads"
    auth_enforcement: bool = False

    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"

    backup_local_dir: str = "data/backups"
    backup_schedule_hour: int = 3
    backup_schedule_minute: int = 0
    backup_retention_daily_days: int = 14
    backup_retention_weekly_weeks: int = 8

    backup_s3_bucket: str | None = None
    backup_s3_prefix: str = "mizan"
    backup_s3_endpoint_url: str | None = None
    backup_s3_region: str | None = None
    backup_s3_access_key_id: str | None = None
    backup_s3_secret_access_key: str | None = None


settings = Settings()
