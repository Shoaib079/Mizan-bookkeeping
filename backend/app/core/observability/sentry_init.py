"""Optional Sentry error tracking — enabled only when ``SENTRY_DSN`` is set."""

from __future__ import annotations


def init_sentry(dsn: str | None, environment: str) -> None:
    """Initialize Sentry when a DSN is configured; no-op otherwise."""
    if not dsn or not dsn.strip():
        return

    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        dsn=dsn.strip(),
        environment=environment,
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
        ],
        traces_sample_rate=0.0,
        send_default_pii=False,
    )
