"""S3-compatible off-site upload storage (Cloudflare R2 / AWS S3)."""

from __future__ import annotations

import uuid
from pathlib import Path

from app.adapters.backup.s3_client import (
    build_s3_client,
    require_backup_bucket,
    s3_object_prefix,
)
from app.config import settings

S3_STORED_PATH_PREFIX = "s3:"


def upload_object_key(
    entity_id: uuid.UUID,
    fingerprint: str,
    *,
    extension: str,
) -> str:
    ext = extension if extension.startswith(".") else f".{extension}"
    relative = f"{entity_id}/{fingerprint}{ext}"
    return s3_object_prefix(settings.backup_s3_prefix, settings.upload_s3_prefix, relative)


def is_s3_stored_path(stored_path: str) -> bool:
    return stored_path.startswith(S3_STORED_PATH_PREFIX)


def s3_key_from_stored_path(stored_path: str) -> str:
    if not is_s3_stored_path(stored_path):
        raise ValueError(f"not an s3 stored path: {stored_path!r}")
    return stored_path[len(S3_STORED_PATH_PREFIX) :]


def save_upload_s3(
    entity_id: uuid.UUID,
    fingerprint: str,
    content: bytes,
    *,
    extension: str,
) -> str:
    bucket = require_backup_bucket()
    key = upload_object_key(entity_id, fingerprint, extension=extension)
    client = build_s3_client()
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=content,
        ServerSideEncryption="AES256",
    )
    return f"{S3_STORED_PATH_PREFIX}{key}"


def read_upload_s3(stored_path: str) -> bytes:
    bucket = require_backup_bucket()
    key = s3_key_from_stored_path(stored_path)
    client = build_s3_client()
    response = client.get_object(Bucket=bucket, Key=key)
    body = response["Body"].read()
    if not isinstance(body, bytes):
        raise TypeError("S3 object body must be bytes")
    return body


def delete_upload_s3(stored_path: str) -> None:
    bucket = require_backup_bucket()
    key = s3_key_from_stored_path(stored_path)
    client = build_s3_client()
    client.delete_object(Bucket=bucket, Key=key)


def upload_exists_s3(stored_path: str) -> bool:
    bucket = require_backup_bucket()
    key = s3_key_from_stored_path(stored_path)
    client = build_s3_client()
    try:
        client.head_object(Bucket=bucket, Key=key)
    except Exception as exc:  # noqa: BLE001 — botocore ClientError when missing
        code = getattr(getattr(exc, "response", None), "get", lambda *_: None)()
        if isinstance(code, dict):
            error_code = code.get("Error", {}).get("Code")
            if error_code in {"404", "NoSuchKey", "NotFound", "403"}:
                return False
        elif hasattr(exc, "response"):
            error_code = exc.response.get("Error", {}).get("Code")
            if error_code in {"404", "NoSuchKey", "NotFound", "403"}:
                return False
        elif exc.__class__.__name__ in {"NoSuchKey", "ClientError"}:
            return False
        raise
    return True


def sync_uploads_prefix_to_directory(dest_root: Path) -> int:
    """Download all objects under the uploads prefix into a local tree for backup bundling."""
    bucket = require_backup_bucket()
    prefix = s3_object_prefix(settings.backup_s3_prefix, settings.upload_s3_prefix)
    list_prefix = f"{prefix}/" if prefix else ""
    client = build_s3_client()
    dest_root.mkdir(parents=True, exist_ok=True)
    count = 0
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=list_prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.endswith("/"):
                continue
            if list_prefix and not key.startswith(list_prefix):
                continue
            relative = key[len(list_prefix) :]
            target = dest_root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            client.download_file(bucket, key, str(target))
            count += 1
    return count
