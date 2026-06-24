"""Application settings — DATABASE_URL and environment (Phase 0).

Production requires ``AUTH_ENFORCEMENT=true`` (default) and Clerk JWT verification.
Tests/dev set ``AUTH_ENFORCEMENT=false`` and ``CLERK_TEST_MODE=true``.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine.url import make_url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://mizan_app:mizan_dev@localhost:5432/mizan"
    test_database_url: str = "postgresql+psycopg://mizan_app:mizan_dev@localhost:5432/mizan_test"
    database_admin_url: str = "postgresql+psycopg://postgres@localhost:5432/postgres"
    upload_dir: str = "data/uploads"
    auth_enforcement: bool = True
    idempotency_enforcement: bool = True

    clerk_secret_key: str | None = None
    clerk_publishable_key: str | None = None
    clerk_jwks_url: str | None = None
    clerk_issuer: str | None = None
    clerk_audience: str | None = None
    clerk_test_mode: bool = False

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

    expense_receipt_vision_url: str | None = None
    expense_receipt_vision_api_key: str | None = None
    expense_receipt_vision_model: str = "gpt-4o-mini"

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def test_database_admin_url(self) -> str:
        """Superuser URL targeting ``mizan_test`` for schema reset + migrations."""
        admin = make_url(self.database_admin_url)
        test_db = make_url(self.test_database_url).database
        return admin.set(database=test_db).render_as_string(hide_password=False)


settings = Settings()
