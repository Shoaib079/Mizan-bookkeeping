"""Permanent security invariants — fail if guards, posting boundary, or RLS regress."""

from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy import text

from app.core.auth.deps import (
    financial_reports_guard,
    member_read_guard,
    operations_write_guard,
    reports_read_guard,
    require_admin_members,
)
from app.db.base import EntityScopedMixin
from app.db.rls import RLS_TABLES
from app.main import app

GUARD_CALLABLES = frozenset(
    {
        member_read_guard,
        operations_write_guard,
        financial_reports_guard,
        reports_read_guard,
        require_admin_members,
    }
)


def _collect_dependency_callables(dependant) -> set:
    found: set = set()
    for sub in dependant.dependencies:
        found.add(sub.call)
        found.update(_collect_dependency_callables(sub))
    return found


def test_every_journal_entry_source_has_correction_classification() -> None:
    """Every JournalEntrySource must be whitelisted for generic correct or routed elsewhere."""
    from app.core.ledger.correction import (
        DEDICATED_CORRECTION_ROUTES,
        GENERIC_CORRECTABLE_SOURCES,
        VOID_AND_REENTER_SOURCES,
        resolve_correction_route,
        verify_correction_source_registry_complete,
    )
    from app.core.ledger.models import JournalEntrySource

    verify_correction_source_registry_complete()

    for source in JournalEntrySource:
        if source in GENERIC_CORRECTABLE_SOURCES:
            continue
        message = resolve_correction_route(source)
        if source in DEDICATED_CORRECTION_ROUTES:
            assert "use the" in message
            assert "flow" in message
        elif source in VOID_AND_REENTER_SOURCES:
            assert "void" in message.lower()


def test_entity_routes_have_auth_guard() -> None:
    """Every /entities/{entity_id} route must declare an auth guard dependency."""
    unguarded: list[str] = []
    for route in app.routes:
        path = getattr(route, "path", "")
        if "/entities/{entity_id}" not in path:
            continue
        dependant = getattr(route, "dependant", None)
        if dependant is None:
            continue
        deps = _collect_dependency_callables(dependant)
        if not deps.intersection(GUARD_CALLABLES):
            methods = ",".join(sorted(getattr(route, "methods", []) or []))
            unguarded.append(f"{methods} {path}")

    assert not unguarded, "Unguarded entity routes:\n" + "\n".join(sorted(unguarded))


def test_journal_entry_construction_only_in_core_ledger() -> None:
    """JournalEntry/JournalEntryLine must only be constructed under app/core/ledger/."""
    app_root = Path(__file__).resolve().parents[1] / "app"
    ledger_root = app_root / "core" / "ledger"
    pattern = re.compile(r"\bJournalEntry(?:Line)?\s*\(")
    violations: list[str] = []

    for path in sorted(app_root.rglob("*.py")):
        if ledger_root in path.parents:
            continue
        source = path.read_text(encoding="utf-8")
        if pattern.search(source):
            violations.append(str(path.relative_to(app_root)))

    assert not violations, "JournalEntry construction outside core/ledger:\n" + "\n".join(
        violations
    )


def _entity_scoped_table_names() -> frozenset[str]:
    """All SQLAlchemy models mixing in EntityScopedMixin."""
    import app.db.bootstrap  # noqa: F401 — load model registry

    tables: set[str] = set()

    def walk(cls: type) -> None:
        for sub in cls.__subclasses__():
            tablename = getattr(sub, "__tablename__", None)
            if tablename:
                tables.add(tablename)
            walk(sub)

    walk(EntityScopedMixin)
    return frozenset(tables)


def test_entity_scoped_tables_match_rls_registry() -> None:
    """RLS_TABLES must cover every EntityScopedMixin table (no drift)."""
    model_tables = _entity_scoped_table_names()
    registry = frozenset(RLS_TABLES)
    missing = model_tables - registry
    extra = registry - model_tables
    assert not missing, f"Entity-scoped tables missing from RLS_TABLES: {sorted(missing)}"
    assert not extra, f"RLS_TABLES entries with no EntityScopedMixin model: {sorted(extra)}"


def test_entity_tables_have_rls_and_policy(db_session) -> None:
    """Every entity-scoped table has RLS enabled and at least one policy."""
    tables = sorted(_entity_scoped_table_names())
    rows = db_session.execute(
        text(
            """
            SELECT c.relname AS table_name,
                   c.relrowsecurity AS rls_enabled,
                   COUNT(p.policyname)::int AS policy_count
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_policies p
              ON p.tablename = c.relname AND p.schemaname = n.nspname
            WHERE n.nspname = 'public'
              AND c.relkind = 'r'
              AND c.relname = ANY(:tables)
            GROUP BY c.relname, c.relrowsecurity
            """
        ),
        {"tables": tables},
    ).all()

    by_name = {row.table_name: row for row in rows}
    failures: list[str] = []
    for table in tables:
        row = by_name.get(table)
        if row is None:
            failures.append(f"{table}: table not found")
            continue
        if not row.rls_enabled:
            failures.append(f"{table}: RLS not enabled")
        if row.policy_count < 1:
            failures.append(f"{table}: no RLS policy")

    assert not failures, "RLS coverage gaps:\n" + "\n".join(failures)
