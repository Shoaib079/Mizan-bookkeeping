"""Normalize Celery Redis broker/result URLs for TLS providers."""

from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def normalize_celery_redis_url(url: str) -> str:
    """Ensure ``rediss://`` URLs include ``ssl_cert_reqs`` (Celery requirement).

    Railway private Redis uses ``redis://`` (no change). Upstash / public TLS
    endpoints use ``rediss://`` and must set ``ssl_cert_reqs`` or Celery refuses
    to start the result backend.
    """
    raw = (url or "").strip()
    if not raw.lower().startswith("rediss://"):
        return raw

    parts = urlsplit(raw)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    if "ssl_cert_reqs" not in query:
        # CERT_NONE is acceptable for managed Redis with provider-issued certs
        # when the client cannot pin a CA bundle in the container.
        query["ssl_cert_reqs"] = "CERT_NONE"
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )
