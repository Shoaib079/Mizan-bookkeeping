"""A skipped guard should not be a silent one.

Every check in `validate_launch_settings` is written `if settings.is_production`,
and `app_env` defaults to "development". A deployment that never set APP_ENV
therefore gets none of them — and nothing fails, because nothing runs. Railway
served real data with a Clerk `pk_test_` key for weeks in exactly that state:
the guard rejecting test keys existed, was correct, and was never reached.

These tests pin two things. That the condition is detected, and — more
importantly — that detecting it never stops the application starting. A
heuristic that can take the books offline is worse than the problem.
"""

from __future__ import annotations

import logging

import pytest

from app import launch
from app.config import _DEFAULT_CORS_ORIGINS

REMOTE_DB = "postgresql+psycopg://user:pw@ep-cool-name.eu-central-1.aws.neon.tech/mizan"
REMOTE_CORS = "https://mizan.vercel.app"
LOCAL_DB = "postgresql+psycopg://mizan_app:mizan_dev@localhost:5432/mizan"


@pytest.fixture
def env(monkeypatch):
    """Point the module's settings at a chosen environment shape."""

    def _apply(*, app_env: str, cors: str, database_url: str):
        monkeypatch.setattr(launch.settings, "app_env", app_env, raising=False)
        monkeypatch.setattr(launch.settings, "cors_origins", cors, raising=False)
        monkeypatch.setattr(
            launch.settings, "database_url", database_url, raising=False
        )

    return _apply


def test_it_warns_when_a_deployed_app_is_not_marked_production(env, caplog):
    env(app_env="development", cors=REMOTE_CORS, database_url=REMOTE_DB)
    with caplog.at_level(logging.WARNING):
        launch.warn_if_deployed_but_not_production()
    assert "APP_ENV" in caplog.text
    # The message has to say the guards were *skipped*, not passed — that
    # distinction is the whole point.
    assert "skipped" in caplog.text.lower()


def test_it_never_raises(env):
    """The guards that should stop a bad launch already exist. This one only
    makes their absence audible, so it must not be able to take the app down."""
    env(app_env="development", cors=REMOTE_CORS, database_url=REMOTE_DB)
    launch.warn_if_deployed_but_not_production()  # no exception is the assertion


def test_it_is_quiet_in_production(env, caplog):
    env(app_env="production", cors=REMOTE_CORS, database_url=REMOTE_DB)
    with caplog.at_level(logging.WARNING):
        launch.warn_if_deployed_but_not_production()
    assert caplog.text == ""


def test_it_is_quiet_on_a_developer_machine(env, caplog):
    env(app_env="development", cors=_DEFAULT_CORS_ORIGINS, database_url=LOCAL_DB)
    with caplog.at_level(logging.WARNING):
        launch.warn_if_deployed_but_not_production()
    assert caplog.text == ""


def test_a_hosted_database_alone_is_not_enough(env, caplog):
    """Working locally against a shared database is ordinary, not a warning.

    Both signals are required precisely so this case stays quiet — a warning
    a developer sees every day is one nobody reads on the day it matters.
    """
    env(app_env="development", cors=_DEFAULT_CORS_ORIGINS, database_url=REMOTE_DB)
    with caplog.at_level(logging.WARNING):
        launch.warn_if_deployed_but_not_production()
    assert caplog.text == ""


def test_a_remote_cors_origin_alone_is_not_enough(env, caplog):
    """Pointing a deployed frontend at a local backend while debugging."""
    env(app_env="development", cors=REMOTE_CORS, database_url=LOCAL_DB)
    with caplog.at_level(logging.WARNING):
        launch.warn_if_deployed_but_not_production()
    assert caplog.text == ""


def test_validate_launch_settings_runs_the_warning_first(env, caplog):
    """Wired in, not merely defined — the failure mode this guards against is
    a check that exists and is never called."""
    env(app_env="development", cors=REMOTE_CORS, database_url=REMOTE_DB)
    with caplog.at_level(logging.WARNING):
        launch.validate_launch_settings()
    assert "APP_ENV" in caplog.text
