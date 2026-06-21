"""Application settings — DATABASE_URL and environment (Phase 0)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://mizan:mizan_dev@localhost:5432/mizan"
    test_database_url: str = "postgresql+psycopg://mizan:mizan_dev@localhost:5432/mizan_test"
    database_admin_url: str = "postgresql+psycopg://postgres@localhost:5432/postgres"
    upload_dir: str = "data/uploads"


settings = Settings()
