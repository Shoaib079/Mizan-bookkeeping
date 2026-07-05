"""Upload storage facade — local disk or S3/R2 (P3 off-site upload backup)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path

from app.adapters.storage import local
from app.adapters.storage import s3 as s3_storage
from app.config import settings


def uses_s3_upload_storage() -> bool:
    return settings.upload_storage.lower() == "s3"


def save_upload(
    entity_id: uuid.UUID,
    fingerprint: str,
    content: bytes,
    *,
    extension: str,
) -> str:
    if uses_s3_upload_storage():
        return s3_storage.save_upload_s3(
            entity_id, fingerprint, content, extension=extension
        )
    return local.save_upload(entity_id, fingerprint, content, extension=extension)


def delete_stored_upload(stored_path: str | None) -> None:
    if not stored_path:
        return
    if s3_storage.is_s3_stored_path(stored_path):
        s3_storage.delete_upload_s3(stored_path)
        return
    local.delete_stored_upload(stored_path)


def upload_exists(stored_path: str) -> bool:
    if s3_storage.is_s3_stored_path(stored_path):
        return s3_storage.upload_exists_s3(stored_path)
    path = Path(stored_path).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    return path.is_file()


def local_upload_path(stored_path: str) -> Path | None:
    """Return a readable local path when the upload is on disk."""
    if s3_storage.is_s3_stored_path(stored_path):
        return None
    path = Path(stored_path).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    return path if path.is_file() else None


def read_upload_bytes(stored_path: str) -> bytes:
    if s3_storage.is_s3_stored_path(stored_path):
        return s3_storage.read_upload_s3(stored_path)
    path = local_upload_path(stored_path)
    if path is None:
        raise FileNotFoundError(stored_path)
    return path.read_bytes()


def prepare_uploads_for_backup(uploads_root: Path) -> int:
    """Ensure uploads_root contains all files to bundle (download from S3 when configured)."""
    uploads_root.mkdir(parents=True, exist_ok=True)
    if uses_s3_upload_storage():
        return s3_storage.sync_uploads_prefix_to_directory(uploads_root)
    return 0


def ensure_storage_roots() -> None:
    local.ensure_storage_roots()


@dataclass(frozen=True, slots=True)
class StoredUploadDocument:
    media_type: str
    local_path: Path | None = None
    content: bytes | None = None

    def as_file_response_args(self) -> tuple[Path | None, bytes | None, str]:
        return self.local_path, self.content, self.media_type


def load_upload_document(stored_path: str, *, media_type: str) -> StoredUploadDocument:
    local_path = local_upload_path(stored_path)
    if local_path is not None:
        return StoredUploadDocument(media_type=media_type, local_path=local_path)
    return StoredUploadDocument(
        media_type=media_type,
        content=read_upload_bytes(stored_path),
    )
