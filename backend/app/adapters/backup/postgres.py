"""PostgreSQL pg_dump / pg_restore and scratch-database helpers (Phase 8)."""

from __future__ import annotations

import os
import subprocess
import uuid
from dataclasses import dataclass

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url


def _normalize_pg_host(host: str | None) -> str:
    """Force TCP on CI — libpq uses a Unix socket for ``localhost`` on Linux."""
    if not host or host in {"localhost", "::1"}:
        return "127.0.0.1"
    return host


def _pg_tool_url(sqlalchemy_url: str) -> URL:
    url = make_url(sqlalchemy_url)
    driver = url.drivername.split("+", 1)[0]
    if driver != "postgresql":
        raise ValueError(f"unsupported database driver for pg_dump: {url.drivername}")
    return url.set(drivername="postgresql", host=_normalize_pg_host(url.host))


def pg_tool_database_url(sqlalchemy_url: str) -> str:
    """Convert SQLAlchemy URL to a libpq-compatible connection string."""
    return _pg_tool_url(sqlalchemy_url).render_as_string(hide_password=False)


def _pg_tool_invocation(sqlalchemy_url: str) -> tuple[list[str], dict[str, str]]:
    """Build pg_dump/pg_restore connection flags and env (PGPASSWORD)."""
    url = _pg_tool_url(sqlalchemy_url)
    args: list[str] = []
    if url.host:
        args.extend(["-h", url.host])
    if url.port:
        args.extend(["-p", str(url.port)])
    if url.username:
        args.extend(["-U", url.username])
    database = url.database or "postgres"
    args.extend(["-d", database])

    env = os.environ.copy()
    if url.password:
        env["PGPASSWORD"] = url.password
    return args, env


def parse_database_name(sqlalchemy_url: str) -> str:
    return make_url(sqlalchemy_url).database or "postgres"


@dataclass(frozen=True, slots=True)
class RowCounts:
    counts: dict[str, int]

    def as_dict(self) -> dict[str, int]:
        return dict(self.counts)


KEY_TABLES: tuple[str, ...] = (
    "entities",
    "journal_entries",
    "journal_entry_lines",
    "suppliers",
    "supplier_ledger_entries",
    "customers",
    "customer_ledger_entries",
    "partners",
    "partner_ledger_entries",
    "employees",
    "staff_ledger_entries",
    "invoice_drafts",
    "bank_statements",
)


def collect_row_counts(database_url: str) -> RowCounts:
    """Row counts for manifest — caller should pass an admin/superuser URL."""
    engine = create_engine(database_url, pool_pre_ping=True)
    counts: dict[str, int] = {}
    with engine.connect() as conn:
        for table in KEY_TABLES:
            counts[table] = int(
                conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one()
            )
    engine.dispose()
    return RowCounts(counts=counts)


def run_pg_dump(database_url: str, output_path: str) -> None:
    """Custom-format compressed dump (-Fc) via pg_dump."""
    conn_args, env = _pg_tool_invocation(database_url)
    result = subprocess.run(
        ["pg_dump", *conn_args, "--format=custom", "--no-owner", "--no-acl", f"--file={output_path}"],
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump failed: {result.stderr.strip() or result.stdout.strip()}")


def run_pg_restore(database_url: str, dump_path: str) -> None:
    """Restore a custom-format dump into the target database."""
    conn_args, env = _pg_tool_invocation(database_url)
    result = subprocess.run(
        ["pg_restore", *conn_args, "--no-owner", "--no-acl", dump_path],
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )
    if result.returncode not in (0, 1):
        raise RuntimeError(f"pg_restore failed: {result.stderr.strip() or result.stdout.strip()}")


def scratch_database_name(prefix: str = "mizan_restore_verify") -> str:
    suffix = uuid.uuid4().hex[:12]
    return f"{prefix}_{suffix}"


def create_scratch_database(admin_url: str, db_name: str) -> None:
    """Create an empty database owned by the mizan role."""
    engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    safe_name = db_name.replace('"', "")
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"),
            {"name": safe_name},
        ).scalar()
        if exists:
            raise RuntimeError(f"scratch database already exists: {safe_name}")
        conn.execute(text(f'CREATE DATABASE "{safe_name}" OWNER mizan'))
    engine.dispose()


def drop_scratch_database(admin_url: str, db_name: str) -> None:
    engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    safe_name = db_name.replace('"', "")
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = :name AND pid <> pg_backend_pid()
                """
            ),
            {"name": safe_name},
        )
        conn.execute(text(f'DROP DATABASE IF EXISTS "{safe_name}"'))
    engine.dispose()


def scratch_database_url(base_url: str, db_name: str) -> str:
    url = make_url(base_url)
    return pg_tool_database_url(
        url.set(database=db_name).render_as_string(hide_password=False)
    )


def pg_tools_available() -> bool:
    for tool in ("pg_dump", "pg_restore"):
        try:
            subprocess.run([tool, "--version"], capture_output=True, check=True)
        except (FileNotFoundError, subprocess.CalledProcessError):
            return False
    return True


def replace_database_in_url(sqlalchemy_url: str, database: str) -> str:
    return make_url(sqlalchemy_url).set(database=database).render_as_string(hide_password=False)
