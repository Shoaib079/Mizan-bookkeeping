"""A skipped guard should not be a silent one.

Every check in `validate_launch_settings` is written `if settings.is_production`,
and `app_env` defaults to "development". A deployment that never set APP_ENV
therefore gets none of them — and nothing fails, because nothing runs. Railway
served real data with a Clerk `pk_test_` key for weeks in exactly that state:
the guard rejecting test keys existed, was correct, and was never reached.

Three things are pinned here, each by asking the question directly rather than
through module state:

  * `looks_deployed` recognises the shape — by being called with the strings.
  * The warning never raises, so a false positive cannot take the app offline.
  * It is wired into `validate_launch_settings`, checked with a spy.

An earlier version patched `app.launch.settings` and asserted on the log. When
the patch did not take, the test saw no warning — which is exactly what it
would see if the code were broken. A test whose failure cannot distinguish
"the code is wrong" from "the setup did not work" is not worth much.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager

from app import launch
from app.config import _DEFAULT_CORS_ORIGINS, Settings

REMOTE_DB = "postgresql+psycopg://user:pw@ep-cool-name.eu-central-1.aws.neon.tech/mizan"
REMOTE_CORS = "https://mizan.vercel.app"
LOCAL_DB = "postgresql+psycopg://mizan_app:mizan_dev@localhost:5432/mizan"
LOOPBACK_DB = "postgresql+psycopg://mizan_app:mizan_dev@127.0.0.1:5432/mizan"


def test_a_hosted_database_behind_a_real_origin_looks_deployed():
    assert launch.looks_deployed(REMOTE_CORS, REMOTE_DB) is True


def test_a_developer_machine_does_not():
    assert launch.looks_deployed(_DEFAULT_CORS_ORIGINS, LOCAL_DB) is False


def test_a_hosted_database_alone_is_not_enough():
    """Working locally against a shared database is ordinary, not a warning.

    Both signals are required precisely so this stays quiet — a warning a
    developer sees every day is one nobody reads on the day it matters.
    """
    assert launch.looks_deployed(_DEFAULT_CORS_ORIGINS, REMOTE_DB) is False


def test_a_remote_origin_alone_is_not_enough():
    """A deployed frontend pointed at a local backend while debugging."""
    assert launch.looks_deployed(REMOTE_CORS, LOCAL_DB) is False


def test_loopback_counts_as_local():
    """127.0.0.1 is the same machine as localhost, spelled differently."""
    assert launch.looks_deployed(REMOTE_CORS, LOOPBACK_DB) is False


def test_an_empty_cors_list_is_not_a_deployment():
    assert launch.looks_deployed("", REMOTE_DB) is False


def test_production_is_never_warned_about():
    """The case that matters least often and most.

    A refactor that made the predicate testable dropped this assertion — the
    early return on `is_production` went uncovered, so nothing would have
    caught a warning fired at every production boot. Restored by giving the
    decision its own function rather than leaving it inline.
    """
    assert (
        launch.should_warn_about_environment(True, REMOTE_CORS, REMOTE_DB) is False
    )


def test_a_deployment_that_forgot_app_env_is_warned_about():
    assert (
        launch.should_warn_about_environment(False, REMOTE_CORS, REMOTE_DB) is True
    )


def test_a_developer_machine_is_not_warned_about():
    assert (
        launch.should_warn_about_environment(False, _DEFAULT_CORS_ORIGINS, LOCAL_DB)
        is False
    )


def test_the_warning_says_the_guards_were_skipped_not_passed():
    """That distinction is the whole content of the message.

    "Every guard passed" and "no guard ran" look identical in a log and mean
    opposite things. This was asserted once, through a log capture, and lost
    when the capture was removed.
    """
    message = launch.disarmed_guards_warning("development")
    assert "skipped, not passed" in message
    assert "'development'" in message, "the message should quote what it found"
    # It has to name the way out, or it is only a complaint.
    assert "APP_ENV=production" in message
    # And the trap: setting it alone, while still on test keys, stops the boot.
    assert "live keys" in message


def test_the_warning_lists_what_is_not_running():
    message = launch.disarmed_guards_warning("development")
    for guard in ("Clerk keys", "AUTH_ENFORCEMENT", "CLERK_TEST_MODE", "CORS_ORIGINS"):
        assert guard in message, f"{guard} is silently disarmed but unmentioned"


def _deployed_but_undeclared() -> Settings:
    """The exact shape that went unnoticed on Railway for weeks."""
    return Settings(
        app_env="development",
        cors_origins=REMOTE_CORS,
        database_url=REMOTE_DB,
    )


@contextmanager
def captured_records():
    """Records emitted by `app.launch`, read outside logging's own handling.

    Logging swallows exceptions raised inside handlers, so a test that merely
    calls the function and expects no error cannot see a broken log call. The
    record is inspected here, in the test body, where a failure surfaces.
    """
    records: list[logging.LogRecord] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    handler = _Capture(level=logging.WARNING)
    previous = launch.logger.level
    launch.logger.addHandler(handler)
    launch.logger.setLevel(logging.WARNING)
    try:
        yield records
    finally:
        launch.logger.removeHandler(handler)
        launch.logger.setLevel(previous)


def test_it_actually_emits_the_warning():
    """The wiring between the decision, the wording and the logger.

    Each of the three is covered on its own above; nothing checked that the
    function joins them up. It could have returned early, or logged something
    else, and every other test here would still pass.
    """
    with captured_records() as records:
        launch.warn_if_deployed_but_not_production(_deployed_but_undeclared())

    assert len(records) == 1, "expected exactly one warning"
    # Rendered in the test, not in a handler, so a bad log call fails here
    # rather than being suppressed by logging.
    assert records[0].getMessage() == launch.disarmed_guards_warning("development")


def test_it_stays_silent_when_there_is_nothing_to_say():
    """The other half of the wiring — and the check that keeps this warning
    from becoming background noise a developer learns to ignore."""
    with captured_records() as records:
        launch.warn_if_deployed_but_not_production(
            Settings(
                app_env="development",
                cors_origins=_DEFAULT_CORS_ORIGINS,
                database_url=LOCAL_DB,
            )
        )
    assert records == []


def test_a_percent_sign_in_the_database_url_survives_the_log():
    """A URL-encoded password is ordinary and must come through intact.

    Not a crash risk: `LogRecord.getMessage` applies %-formatting only when
    args are present, and this call passes none. The earlier version of this
    test asserted a hazard that does not exist, on the strength of a probe
    that applied the format operator by hand — something logging never does.
    What is worth holding is that the URL is not mangled or dropped.
    """
    with captured_records() as records:
        launch.warn_if_deployed_but_not_production(
            Settings(
                app_env="development",
                cors_origins=REMOTE_CORS,
                database_url="postgresql+psycopg://u:p%2Fw@db.neon.tech/mizan",
            )
        )
    assert len(records) == 1
    assert records[0].getMessage() == launch.disarmed_guards_warning("development")


def test_validate_launch_settings_runs_the_warning_first(monkeypatch):
    """Wired in, not merely defined.

    The failure this whole module guards against is a check that exists and is
    never called, so the test for it must be about the call — not about what
    the check decides.
    """
    calls: list[int] = []
    monkeypatch.setattr(
        launch,
        "warn_if_deployed_but_not_production",
        # *args so this keeps testing the wiring rather than the signature —
        # it now takes an optional config, and a stricter stub would fail on
        # that change while telling us nothing about whether it is called.
        lambda *args, **kwargs: calls.append(1),
    )
    launch.validate_launch_settings()
    assert calls == [1], "validate_launch_settings no longer runs the warning"
