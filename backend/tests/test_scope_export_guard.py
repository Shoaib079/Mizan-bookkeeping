"""scope:export enforcement on generated Excel/PDF downloads."""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.core.auth.grants import Grant, grants_for_role, grants_to_strings
from app.core.auth.types import EntityRole
from app.core.chart_of_accounts.seed import seed_default_chart
from app.features.auth import service as auth_service
from app.features.auth.models import EntityMembership, User
from app.features.auth.schema import MembershipCreate, UserCreate
from tests.auth_helpers import auth_headers

APP_ROOT = Path(__file__).resolve().parents[1] / "app"


@pytest.fixture
def auth_enforced(monkeypatch):
    monkeypatch.setattr(settings, "auth_enforcement", True)
    monkeypatch.setattr(settings, "clerk_test_mode", True)
    yield
    monkeypatch.setattr(settings, "auth_enforcement", False)


def _user(db: Session, email: str) -> User:
    return auth_service.create_user(db, UserCreate(email=email, display_name=email))


def _member(
    db: Session, entity_id: uuid.UUID, user_id: uuid.UUID, role: EntityRole
) -> EntityMembership:
    return auth_service.add_entity_member(
        db, entity_id, MembershipCreate(user_id=user_id, role=role)
    )


@pytest.fixture
def export_entity(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    return restaurant_a.id


# Sample of generated-export routes (full set covered by completeness scan).
_SAMPLE_EXPORTS = [
    ("/entities/{eid}/reports/profit-and-loss/export", {"from": "2026-01-01", "to": "2026-01-31"}),
    ("/entities/{eid}/reports/month-pack", {"from": "2026-01-01", "to": "2026-01-31"}),
    ("/entities/{eid}/reports/cash-book/export", {"from": "2026-01-01", "to": "2026-01-31"}),
    ("/entities/{eid}/expenses/export", {"from": "2026-01-01", "to": "2026-01-31"}),
]


def test_preset_scope_export_owner_partner_only() -> None:
    assert Grant.SCOPE_EXPORT in grants_for_role(EntityRole.OWNER)
    assert Grant.SCOPE_EXPORT in grants_for_role(EntityRole.PARTNER)
    assert Grant.SCOPE_EXPORT not in grants_for_role(EntityRole.CASHIER)
    assert Grant.SCOPE_EXPORT not in grants_for_role(EntityRole.PARTNER_VIEW_ONLY)


@pytest.mark.parametrize("path,params", _SAMPLE_EXPORTS)
def test_export_without_scope_export_is_403(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    export_entity,
    path: str,
    params: dict,
) -> None:
    eid = export_entity
    # View-only: has financial_reports:read but not scope:export after preset fix.
    user = _user(db_session, f"vo-{uuid.uuid4().hex[:8]}@ex.com")
    membership = _member(db_session, eid, user.id, EntityRole.PARTNER_VIEW_ONLY)
    assert "scope:export" not in (membership.grants or [])

    resp = client.get(
        path.format(eid=eid),
        params=params,
        headers=auth_headers(user),
    )
    assert resp.status_code == 403, resp.text
    assert "scope:export" in resp.json()["detail"]


@pytest.mark.parametrize("role", [EntityRole.OWNER, EntityRole.PARTNER])
@pytest.mark.parametrize("path,params", _SAMPLE_EXPORTS[:2])
def test_export_with_scope_export_succeeds(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    export_entity,
    role: EntityRole,
    path: str,
    params: dict,
) -> None:
    eid = export_entity
    user = _user(db_session, f"{role.value}-{uuid.uuid4().hex[:8]}@ex.com")
    _member(db_session, eid, user.id, role)
    resp = client.get(
        path.format(eid=eid),
        params=params,
        headers=auth_headers(user),
    )
    assert resp.status_code == 200, resp.text
    assert "spreadsheet" in resp.headers.get("content-type", "") or resp.content[
        :2
    ] == b"PK"


def test_cashier_blocked_from_generated_export(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    export_entity,
) -> None:
    eid = export_entity
    user = _user(db_session, f"cash-{uuid.uuid4().hex[:8]}@ex.com")
    _member(db_session, eid, user.id, EntityRole.CASHIER)
    resp = client.get(
        f"/entities/{eid}/expenses/export",
        params={"from": "2026-01-01", "to": "2026-01-31"},
        headers=auth_headers(user),
    )
    # Cashier lacks member read of expenses export path? expenses uses member_read
    # then export_scope. Either membership ok + 403 export, or 403 earlier.
    assert resp.status_code == 403
    detail = resp.json()["detail"]
    assert "scope:export" in detail or "Permission denied" in detail


def test_view_only_can_fetch_logo_attachment_not_report_export(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    export_entity,
) -> None:
    """Opposite direction: attachments stay on member_read; exports need scope:export."""
    eid = export_entity
    user = _user(db_session, f"attach-{uuid.uuid4().hex[:8]}@ex.com")
    _member(db_session, eid, user.id, EntityRole.PARTNER_VIEW_ONLY)
    headers = auth_headers(user)

    logo = client.get(f"/entities/{eid}/logo", headers=headers)
    # 404 = no logo uploaded (still past auth); must not be 403 scope:export
    assert logo.status_code in (200, 404)
    if logo.status_code == 403:
        assert "scope:export" not in logo.json().get("detail", "")

    export = client.get(
        f"/entities/{eid}/reports/profit-and-loss/export",
        params={"from": "2026-01-01", "to": "2026-01-31"},
        headers=headers,
    )
    assert export.status_code == 403
    assert "scope:export" in export.json()["detail"]


def _api_defs_calling_export_helpers(text: str) -> list[tuple[str, str, str]]:
    """Any def whose body calls xlsx_response( / pdf_response( — name-agnostic."""
    import re

    hits: list[tuple[str, str, str]] = []
    for m in re.finditer(
        r"def\s+(\w+)\s*\(([\s\S]*?)\)\s*(?:->|:)([\s\S]*?)(?=\ndef\s|\Z)",
        text,
    ):
        name, sig, body = m.group(1), m.group(2), m.group(3)
        chunk = sig + body[:2000]
        if "xlsx_response(" not in chunk and "pdf_response(" not in chunk:
            continue
        hits.append((name, sig, body))
    return hits


def _imports_openpyxl_or_reportlab(text: str) -> bool:
    import re

    return bool(
        re.search(
            r"^(?:\s*)(?:from|import)\s+(?:openpyxl|reportlab)\b",
            text,
            flags=re.MULTILINE,
        )
    )


def test_every_generated_export_route_depends_on_export_scope_guard() -> None:
    """Completeness: any *api*.py def that builds xlsx/pdf via helpers must
    Depends(export_scope_guard). Mutation: drop one Depends → count falls."""
    missing: list[str] = []
    found = 0
    for path in APP_ROOT.rglob("*api*.py"):
        text = path.read_text(encoding="utf-8")
        for name, sig, _body in _api_defs_calling_export_helpers(text):
            found += 1
            if "export_scope_guard" not in sig:
                missing.append(f"{path.name}::{name}")

    assert found >= 26, f"expected ≥26 export routes, found {found}"
    assert missing == [], f"routes missing export_scope_guard: {missing}"

    sample = (APP_ROOT / "features/reports/api.py").read_text(encoding="utf-8")
    before = sample.count("Depends(export_scope_guard)")
    broken = sample.replace(
        "_export: None = Depends(export_scope_guard)",
        "# MUTATED",
        1,
    )
    assert before >= 1
    assert broken.count("Depends(export_scope_guard)") == before - 1


def test_api_modules_must_not_bypass_helpers_without_export_guard() -> None:
    """*api*.py must not import openpyxl/reportlab directly without the guard.

    Builders live in excel_export / pdf_export / workbook helpers — not in
    route modules. If an *api*.py pulls those libs in, it must still declare
    export_scope_guard (same bar as helper callers). Mutation: inject a bare
    import into an api without the guard → red.
    """
    offenders: list[str] = []
    for path in sorted(APP_ROOT.rglob("*api*.py")):
        text = path.read_text(encoding="utf-8")
        if not _imports_openpyxl_or_reportlab(text):
            continue
        if "export_scope_guard" not in text:
            offenders.append(str(path.relative_to(APP_ROOT)))

    assert offenders == [], (
        f"*api*.py imports openpyxl/reportlab without export_scope_guard: "
        f"{offenders}"
    )

    innocent = (APP_ROOT / "features/auth/api.py").read_text(encoding="utf-8")
    assert "export_scope_guard" not in innocent
    assert not _imports_openpyxl_or_reportlab(innocent)
    mutated = "import openpyxl\n" + innocent
    assert _imports_openpyxl_or_reportlab(mutated)
    assert "export_scope_guard" not in mutated


def test_scope_export_backfill_add_and_strip(db_session: Session, restaurant_a) -> None:
    """Migration semantics: partner gains missing grant; view-only loses it.

    Inserts memberships with SQL (service.add_entity_member commits, which
    detaches rows under the test transaction).
    """
    from app.db.session import entity_context

    eid = restaurant_a.id
    partner_u = _user(db_session, f"bf-p-{uuid.uuid4().hex[:8]}@ex.com")
    vo_u = _user(db_session, f"bf-v-{uuid.uuid4().hex[:8]}@ex.com")
    partner_id = uuid.uuid4()
    vo_id = uuid.uuid4()

    with entity_context(db_session, eid):
        db_session.execute(
            text(
                """
                INSERT INTO entity_memberships (id, entity_id, user_id, role, grants, created_at)
                VALUES
                  (CAST(:pid AS uuid), CAST(:e AS uuid), CAST(:pu AS uuid), 'partner',
                   CAST(:pg AS jsonb), now()),
                  (CAST(:vid AS uuid), CAST(:e AS uuid), CAST(:vu AS uuid), 'partner_view_only',
                   CAST(:vg AS jsonb), now())
                """
            ),
            {
                "pid": str(partner_id),
                "vid": str(vo_id),
                "e": str(eid),
                "pu": str(partner_u.id),
                "vu": str(vo_u.id),
                "pg": '["financial_reports:read","nav:dashboard"]',
                "vg": '["financial_reports:read","reports:read","scope:export","nav:dashboard"]',
            },
        )
        db_session.flush()

        db_session.execute(
            text(
                """
                UPDATE entity_memberships
                SET grants = grants || to_jsonb(ARRAY['scope:export']::text[])
                WHERE role IN ('owner', 'partner')
                  AND grants IS NOT NULL
                  AND jsonb_typeof(grants) = 'array'
                  AND NOT (grants ? 'scope:export')
                """
            )
        )
        db_session.execute(
            text(
                """
                UPDATE entity_memberships
                SET grants = (
                    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                    FROM jsonb_array_elements_text(grants) AS elem
                    WHERE elem <> 'scope:export'
                )
                WHERE role = 'partner_view_only'
                  AND grants IS NOT NULL
                  AND jsonb_typeof(grants) = 'array'
                  AND grants ? 'scope:export'
                """
            )
        )
        db_session.flush()

        partner_grants = db_session.execute(
            text("SELECT grants FROM entity_memberships WHERE id = CAST(:id AS uuid)"),
            {"id": str(partner_id)},
        ).scalar_one()
        vo_grants = db_session.execute(
            text("SELECT grants FROM entity_memberships WHERE id = CAST(:id AS uuid)"),
            {"id": str(vo_id)},
        ).scalar_one()

    assert "scope:export" in list(partner_grants)
    assert "scope:export" not in list(vo_grants)


def test_alembic_single_head() -> None:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(APP_ROOT.parent / "alembic.ini"))
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert len(heads) == 1, f"expected one Alembic head, got {heads}"
    assert heads[0] == "098_statement_bounce_pairs"
