"""Permanent security invariants — fail if guards, posting boundary, or RLS regress."""

from __future__ import annotations

import ast
import re
from importlib.resources import files
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
from app.db.audit_immutability import (
    IMMUTABLE_AUDIT_TABLES,
    audit_immutability_triggers_present,
    discover_audit_event_tables,
)
from app.db.period_locks_immutability import period_locks_immutability_triggers_present
from app.db.provisioning import AUDIT_IMMUTABILITY_TRIGGERS, PERIOD_LOCKS_IMMUTABILITY_TRIGGERS
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


def test_immutable_audit_registry_covers_all_audit_tables() -> None:
    """Every *_audit_events table must be registered in IMMUTABLE_AUDIT_TABLES."""
    discovered = discover_audit_event_tables()
    missing = discovered - IMMUTABLE_AUDIT_TABLES
    extra = IMMUTABLE_AUDIT_TABLES - discovered
    assert not missing, f"Audit tables missing from IMMUTABLE_AUDIT_TABLES: {sorted(missing)}"
    assert not extra, f"IMMUTABLE_AUDIT_TABLES entries with no model: {sorted(extra)}"


def test_immutable_audit_tables_have_append_only_triggers(db_session) -> None:
    """Every IMMUTABLE_AUDIT_TABLES entry must have an append-only trigger installed."""
    present = frozenset(audit_immutability_triggers_present(db_session.connection()))
    missing = AUDIT_IMMUTABILITY_TRIGGERS - present
    assert not missing, f"Missing audit immutability triggers: {sorted(missing)}"


def test_period_locks_table_has_delete_protection_trigger(db_session) -> None:
    """period_locks must reject DELETE at the database layer."""
    present = frozenset(period_locks_immutability_triggers_present(db_session.connection()))
    missing = PERIOD_LOCKS_IMMUTABILITY_TRIGGERS - present
    assert not missing, f"Missing period lock immutability triggers: {sorted(missing)}"


def test_pdf_export_has_no_top_level_reportlab_import() -> None:
    """Missing reportlab must not break API import or pytest collection."""
    app_root = Path(__file__).resolve().parents[1] / "app"
    path = app_root / "features" / "reports" / "pdf_export.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    offenders: list[str] = []
    for node in tree.body:
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "reportlab" or alias.name.startswith("reportlab."):
                    offenders.append(f"import {alias.name}")
        elif isinstance(node, ast.ImportFrom) and node.module:
            if node.module == "reportlab" or node.module.startswith("reportlab."):
                offenders.append(f"from {node.module} import ...")
    assert not offenders, (
        "pdf_export.py must lazy-import reportlab inside functions only:\n"
        + "\n".join(offenders)
    )


def test_bundled_pdf_fonts_ship_with_package() -> None:
    """Unicode PDF fonts must ship inside the app package (no OS font dependency)."""
    font_dir = files("app").joinpath("assets", "fonts")
    for filename in ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "LICENSE"):
        assert font_dir.joinpath(filename).is_file(), f"missing bundled font asset: {filename}"


def test_app_main_imports_after_editable_install() -> None:
    """Boot check — app.main must import when project dependencies are installed."""
    import app.main  # noqa: F401

    assert app.main.app is not None


def test_every_journal_entry_source_has_cash_flow_classification() -> None:
    """Every JournalEntrySource must be classified for cash-flow reporting."""
    from app.features.reports.cash_flow import verify_cash_flow_source_registry_complete

    verify_cash_flow_source_registry_complete()


def test_subledger_immutability_registry_complete() -> None:
    """Every *_ledger_entries table must be registered for immutability guards."""
    from app.db.subledger_immutability import verify_subledger_immutability_registry_complete

    verify_subledger_immutability_registry_complete()


def test_subledger_tables_have_immutability_triggers(db_session) -> None:
    """Every IMMUTABLE_SUBLEDGER_TABLES entry must have an immutability trigger."""
    from app.db.subledger_immutability import (
        SUBLEDGER_IMMUTABILITY_TRIGGERS,
        subledger_immutability_triggers_present,
    )

    present = frozenset(subledger_immutability_triggers_present(db_session.connection()))
    missing = SUBLEDGER_IMMUTABILITY_TRIGGERS - present
    assert not missing, f"Missing subledger immutability triggers: {sorted(missing)}"


def test_subledger_control_account_tie_registry_complete() -> None:
    """Every *_ledger_entries table and tip_accruals must map to a control GL account."""
    from app.core.subledger.control_account_tie import (
        verify_control_account_tie_registry_complete,
    )

    verify_control_account_tie_registry_complete()


def test_control_accounts_tied_on_empty_seeded_entity(db_session, restaurant_a) -> None:
    """Empty entity with seeded chart — all subledger totals tie to zero GL balances."""
    from app.core.chart_of_accounts.seed import seed_default_chart
    from app.core.subledger.control_account_tie import assert_entity_control_accounts_tied

    seed_default_chart(db_session, restaurant_a.id)
    assert_entity_control_accounts_tied(db_session, restaurant_a.id)
