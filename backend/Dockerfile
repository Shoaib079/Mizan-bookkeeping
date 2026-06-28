# Mizan API — production image (Phase 12 Slice 12.1)
# Build: docker build -t mizan-api ./backend
# Run:   docker run -p 8000:8000 --env-file .env.production mizan-api

FROM python:3.12-slim AS builder

WORKDIR /app

RUN pip install --no-cache-dir --retries 5 --timeout 120 --upgrade pip setuptools wheel

COPY pyproject.toml .
COPY app app/

RUN pip install --no-cache-dir --retries 5 --timeout 120 .


FROM python:3.12-slim AS runtime

WORKDIR /app

# pg_dump/pg_restore for scheduled backups (Celery worker)
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY app app/
COPY alembic alembic/
COPY alembic.ini .
COPY scripts scripts/

RUN mkdir -p data/uploads data/backups \
    && groupadd --system app \
    && useradd --system --gid app --home /app app \
    && chown -R app:app /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
