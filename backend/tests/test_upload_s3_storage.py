"""S3/R2 upload storage — off-site persistence (P3)."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.adapters.storage import s3 as s3_storage
from app.adapters.storage.facade import (
    delete_stored_upload,
    load_upload_document,
    prepare_uploads_for_backup,
    read_upload_bytes,
    save_upload,
    upload_exists,
    uses_s3_upload_storage,
)
from app.config import settings


@pytest.fixture
def s3_upload_settings(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "upload_storage", "s3")
    monkeypatch.setattr(settings, "backup_s3_bucket", "mizan-backups")
    monkeypatch.setattr(settings, "backup_s3_prefix", "mizan")
    monkeypatch.setattr(settings, "upload_s3_prefix", "uploads")
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))
    return tmp_path


def test_upload_object_key_includes_entity_and_fingerprint() -> None:
    entity_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    key = s3_storage.upload_object_key(entity_id, "abc123", extension=".pdf")
    assert key == "mizan/uploads/11111111-1111-1111-1111-111111111111/abc123.pdf"


def test_save_upload_writes_to_s3(s3_upload_settings) -> None:
    entity_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    client = MagicMock()
    with patch("app.adapters.storage.s3.build_s3_client", return_value=client):
        stored = save_upload(entity_id, "deadbeef", b"pdf-bytes", extension=".pdf")
    assert stored.startswith("s3:mizan/uploads/")
    client.put_object.assert_called_once()
    assert client.put_object.call_args.kwargs["Body"] == b"pdf-bytes"


def test_read_and_delete_s3_upload(s3_upload_settings) -> None:
    stored = "s3:mizan/uploads/11111111-1111-1111-1111-111111111111/abc.pdf"
    client = MagicMock()
    client.get_object.return_value = {"Body": MagicMock(read=lambda: b"hello")}
    with patch("app.adapters.storage.s3.build_s3_client", return_value=client):
        assert read_upload_bytes(stored) == b"hello"
        assert upload_exists(stored) is True
        delete_stored_upload(stored)
    client.delete_object.assert_called_once()


def test_load_upload_document_from_s3(s3_upload_settings) -> None:
    stored = "s3:mizan/uploads/11111111-1111-1111-1111-111111111111/abc.pdf"
    client = MagicMock()
    client.get_object.return_value = {"Body": MagicMock(read=lambda: b"%PDF")}
    with patch("app.adapters.storage.s3.build_s3_client", return_value=client):
        doc = load_upload_document(stored, media_type="application/pdf")
    assert doc.local_path is None
    assert doc.content == b"%PDF"
    assert doc.media_type == "application/pdf"


def test_prepare_uploads_for_backup_downloads_s3_prefix(s3_upload_settings) -> None:
    dest = s3_upload_settings / "bundle-uploads"
    client = MagicMock()
    paginator = MagicMock()
    paginator.paginate.return_value = [
        {
            "Contents": [
                {"Key": "mizan/uploads/ent-1/file.pdf"},
            ]
        }
    ]
    client.get_paginator.return_value = paginator
    with patch("app.adapters.storage.s3.build_s3_client", return_value=client):
        count = prepare_uploads_for_backup(dest)
    assert count == 1
    client.download_file.assert_called_once()


def test_local_storage_when_not_s3(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(settings, "upload_storage", "local")
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))
    entity_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    stored = save_upload(entity_id, "local1", b"data", extension=".xml")
    assert not stored.startswith("s3:")
    assert uses_s3_upload_storage() is False
    assert read_upload_bytes(stored) == b"data"
