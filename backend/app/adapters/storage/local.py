"""Local filesystem storage for uploaded invoice documents."""

from __future__ import annotations

import uuid
from pathlib import Path

from app.config import settings


def save_upload(
    entity_id: uuid.UUID,
    fingerprint: str,
    content: bytes,
    *,
    extension: str,
) -> str:
    """Persist upload bytes; return absolute path as string."""
    base = Path(settings.upload_dir)
    dest_dir = base / str(entity_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    ext = extension if extension.startswith(".") else f".{extension}"
    dest = dest_dir / f"{fingerprint}{ext}"
    dest.write_bytes(content)
    return str(dest.resolve())
