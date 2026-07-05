"""Shared S3-compatible client factory (backups + upload storage)."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

from app.config import settings


def s3_object_prefix(*parts: str) -> str:
    cleaned = [part.strip("/") for part in parts if part and part.strip("/")]
    return "/".join(cleaned)


def build_s3_client():
    import boto3

    client_kwargs: dict = {}
    if settings.backup_s3_endpoint_url:
        client_kwargs["endpoint_url"] = settings.backup_s3_endpoint_url
    if settings.backup_s3_region:
        client_kwargs["region_name"] = settings.backup_s3_region
    if settings.backup_s3_access_key_id:
        client_kwargs["aws_access_key_id"] = settings.backup_s3_access_key_id
    if settings.backup_s3_secret_access_key:
        client_kwargs["aws_secret_access_key"] = settings.backup_s3_secret_access_key
    return boto3.client("s3", **client_kwargs)


def require_backup_bucket() -> str:
    if not settings.backup_s3_bucket:
        raise RuntimeError("backup_s3_bucket is required for S3 upload storage")
    return settings.backup_s3_bucket
