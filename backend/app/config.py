"""Application settings — DATABASE_URL and environment (Phase 0).

Production requires ``AUTH_ENFORCEMENT=true`` (default) and Clerk JWT verification.
Tests/dev set ``AUTH_ENFORCEMENT=false`` and ``CLERK_TEST_MODE=true``.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine.url import make_url

_DEFAULT_CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"


def parse_cors_origins(value: str) -> list[str]:
    """Split comma-separated CORS origins; empty segments are dropped."""
    return [origin.strip() for origin in value.split(",") if origin.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    cors_origins: str = _DEFAULT_CORS_ORIGINS
    database_url: str = "postgresql+psycopg://mizan_app:mizan_dev@localhost:5432/mizan"
    test_database_url: str = "postgresql+psycopg://mizan_app:mizan_dev@localhost:5432/mizan_test"
    database_admin_url: str = "postgresql+psycopg://mizan:mizan_dev@localhost:5432/postgres"
    upload_dir: str = "data/uploads"
    upload_storage: str = "local"
    upload_s3_prefix: str = "uploads"
    auth_enforcement: bool = True
    self_signup_enabled: bool = True
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

    sentry_dsn: str | None = None
    rate_limit_per_minute: int = 60

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def cors_origins_list(self) -> list[str]:
        return parse_cors_origins(self.cors_origins)

    @property
    def database_cluster_admin_url(self) -> str:
        """Admin connection to the Postgres cluster (``postgres`` catalog database)."""
        admin = make_url(self.database_admin_url)
        if (admin.username or "").lower() == "postgres" and not admin.password:
            app = make_url(self.database_url)
            admin = admin.set(username="mizan", password=app.password or "mizan_dev")
        return admin.render_as_string(hide_password=False)

    @property
    def database_migration_url(self) -> str:
        """Schema-owner URL for Alembic on the app database (``mizan`` in dev)."""
        admin = make_url(self.database_cluster_admin_url)
        app_db = make_url(self.database_url).database
        return admin.set(database=app_db).render_as_string(hide_password=False)

    @property
    def test_database_admin_url(self) -> str:
        """Superuser URL targeting ``mizan_test`` for schema reset + migrations."""
        admin = make_url(self.database_admin_url)
        test_db = make_url(self.test_database_url).database
        return admin.set(database=test_db).render_as_string(hide_password=False)


settings = Settings()
