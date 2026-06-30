"""Local filesystem storage for uploaded invoice documents."""

from __future__ import annotations

import uuid
from pathlib import Path

from app.config import settings


def _resolve_storage_root(path_str: str) -> Path:
    """Resolve configured storage path and ensure the directory exists."""
    path = Path(path_str).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def ensure_storage_roots() -> None:
    """Create upload and backup roots (required after empty Railway/Render volume mount)."""
    _resolve_storage_root(settings.upload_dir)
    _resolve_storage_root(settings.backup_local_dir)


def save_upload(
    entity_id: uuid.UUID,
    fingerprint: str,
    content: bytes,
    *,
    extension: str,
) -> str:
    """Persist upload bytes; return absolute path as string."""
    base = _resolve_storage_root(settings.upload_dir)
    dest_dir = base / str(entity_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    ext = extension if extension.startswith(".") else f".{extension}"
    dest = dest_dir / f"{fingerprint}{ext}"
    dest.write_bytes(content)
    return str(dest.resolve())


def delete_stored_upload(stored_path: str | None) -> None:
    """Remove one upload file under the configured upload root (no-op if missing)."""
    if not stored_path:
        return
    path = Path(stored_path).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    path = path.resolve()
    upload_root = _resolve_storage_root(settings.upload_dir)
    try:
        path.relative_to(upload_root)
    except ValueError:
        return
    if path.is_file():
        path.unlink()
    current = path.parent
    while current != upload_root and upload_root in current.parents:
        try:
            current.rmdir()
        except OSError:
            break
        current = current.parent
