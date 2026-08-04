"""Celery Redis URL normalization (rediss ssl_cert_reqs)."""

from app.workers.celery_redis_url import normalize_celery_redis_url


def test_redis_plain_unchanged() -> None:
    url = "redis://default:secret@redis.railway.internal:6379/0"
    assert normalize_celery_redis_url(url) == url


def test_rediss_adds_ssl_cert_reqs() -> None:
    url = "rediss://default:secret@example.upstash.io:6379"
    out = normalize_celery_redis_url(url)
    assert "ssl_cert_reqs=CERT_NONE" in out
    assert out.startswith("rediss://")


def test_rediss_preserves_existing_ssl_cert_reqs() -> None:
    url = "rediss://default:secret@example.upstash.io:6379?ssl_cert_reqs=CERT_REQUIRED"
    assert normalize_celery_redis_url(url) == url
