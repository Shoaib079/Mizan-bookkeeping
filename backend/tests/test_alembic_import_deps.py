"""Alembic/bootstrap must not require optional-dev-only packages at import."""

from __future__ import annotations

import ast
import tomllib
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_httpx_is_a_runtime_dependency() -> None:
    """Clerk invites + Docker migrate image install ``.`` without ``[dev]``."""
    project = tomllib.loads((BACKEND_ROOT / "pyproject.toml").read_text())["project"]
    runtime = " ".join(project.get("dependencies", []))
    assert "httpx" in runtime


def test_idempotency_package_init_does_not_import_middleware() -> None:
    """``import app.db.bootstrap`` loads this package; middleware pulls auth/httpx."""
    init_path = BACKEND_ROOT / "app" / "core" / "idempotency" / "__init__.py"
    tree = ast.parse(init_path.read_text())
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)
            for alias in node.names:
                imported.add(f"{node.module}.{alias.name}")
    assert not any("middleware" in name for name in imported)


def test_bootstrap_imports_without_clerk_http_client() -> None:
    """Smoke: model registry import used by Alembic env.py."""
    import app.db.bootstrap  # noqa: F401
