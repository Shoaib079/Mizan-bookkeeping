"""Automated backups — artifact, restore verification, retention (Phase 8)."""

from __future__ import annotations

import tarfile
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest

from app.adapters.backup.archive import (
    DATABASE_DUMP_NAME,
    MANIFEST_NAME,
    UPLOADS_DIR_NAME,
    BackupManifest,
    create_backup_bundle,
    extract_backup_bundle,
)
from app.adapters.backup.postgres import (
    create_scratch_database,
    drop_scratch_database,
    pg_tool_database_url,
    pg_tools_available,
    replace_database_in_url,
    run_pg_restore,
    scratch_database_name,
)
from app.adapters.backup.storage import LocalBackupStorage, retention_keys_to_keep
from app.adapters.storage import save_upload
from app.config import settings
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.onboarding.posting import post_opening_balances
from app.features.backups import service
from app.features.backups.integrity import verify_restored_database
from app.features.onboarding.opening_balances import OpeningBalanceLineInput

requires_pg_tools = pytest.mark.skipif(
    not pg_tools_available(), reason="pg_dump/pg_restore not in PATH"
)

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
GO_LIVE = date(2026, 1, 1)


@pytest.fixture
def backup_settings(tmp_path, monkeypatch, test_engine):
    backup_dir = tmp_path / "backups"
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    backup_dir.mkdir()
    monkeypatch.setattr(settings, "backup_local_dir", str(backup_dir))
    monkeypatch.setattr(settings, "upload_dir", str(upload_dir))
    monkeypatch.setattr(settings, "backup_s3_bucket", None)
    monkeypatch.setattr(settings, "database_url", settings.test_database_url)
    return {"backup_dir": backup_dir, "upload_dir": upload_dir}


def test_pg_tool_database_url_strips_sqlalchemy_driver() -> None:
    url = "postgresql+psycopg://mizan:mizan_dev@localhost:5432/mizan_test"
    assert (
        pg_tool_database_url(url)
        == "postgresql://mizan:mizan_dev@127.0.0.1:5432/mizan_test"
    )


def test_replace_database_in_url_keeps_sqlalchemy_driver() -> None:
    url = "postgresql+psycopg://postgres:mizan_dev@localhost:5432/postgres"
    assert (
        replace_database_in_url(url, "mizan_test")
        == "postgresql+psycopg://postgres:mizan_dev@localhost:5432/mizan_test"
    )


def test_retention_keeps_daily_and_weekly() -> None:
    today = date(2026, 6, 22)
    keys = []
    for day in range(70):
        moment = today - timedelta(days=day)
        ts = datetime.combine(moment, datetime.min.time(), tzinfo=UTC).strftime("%Y%m%dT%H%M%SZ")
        keys.append(f"mizan-backup-{ts}.tar.gz")

    keep = retention_keys_to_keep(keys, daily_days=14, weekly_weeks=8, as_of=today)
    assert len(keep) >= 14
    assert keys[0] in keep
    assert keys[13] in keep
    assert keys[59] not in keep


def test_backup_bundle_has_manifest_db_uploads_and_checksum(tmp_path) -> None:
    dump_path = tmp_path / DATABASE_DUMP_NAME
    dump_path.write_bytes(b"fake-pg-dump")
    uploads = tmp_path / "src-uploads"
    uploads.mkdir()
    sample = uploads / "entity" / "abc.pdf"
    sample.parent.mkdir(parents=True)
    sample.write_bytes(b"pdf")

    artifact_path, manifest = create_backup_bundle(
        dump_path=dump_path,
        uploads_root=uploads,
        git_tag="v0.test",
        row_counts={"entities": 1},
        output_dir=tmp_path / "out",
        timestamp="20260622T030000Z",
    )

    assert artifact_path.exists()
    assert manifest.sha256
    assert manifest.row_counts["entities"] == 1

    extracted = tmp_path / "extracted"
    loaded = extract_backup_bundle(artifact_path, extracted)
    assert loaded.sha256 == manifest.sha256
    assert (extracted / DATABASE_DUMP_NAME).read_bytes() == b"fake-pg-dump"
    assert (extracted / UPLOADS_DIR_NAME / "entity" / "abc.pdf").exists()
    assert (extracted / MANIFEST_NAME).exists()


@requires_pg_tools
def test_run_backup_restore_and_integrity_pass(db_session, restaurant_a, backup_settings) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    post_opening_balances(
        db_session,
        restaurant_a.id,
        go_live_date=GO_LIVE,
        lines=[
            OpeningBalanceLineInput(
                account_code="1000",
                amount_kurus=100_000,
                side=AccountNormalBalance.DEBIT,
            )
        ],
        actor_id=ACTOR_ID,
    )
    db_session.commit()

    content = b"<?xml version='1.0'?><Invoice/>"
    save_upload(restaurant_a.id, "deadbeef", content, extension=".xml")

    result = service.run_backup(timestamp="20260622T120000Z")
    assert result.artifact_key == "mizan-backup-20260622T120000Z.tar.gz"
    assert result.sha256
    assert result.row_counts["entities"] >= 1

    artifact = backup_settings["backup_dir"] / result.artifact_key
    assert artifact.exists()
    with tarfile.open(artifact, "r:gz") as archive:
        names = archive.getnames()
    assert MANIFEST_NAME in names
    assert DATABASE_DUMP_NAME in names
    assert f"{UPLOADS_DIR_NAME}/" in names or UPLOADS_DIR_NAME in names

    scratch = scratch_database_name()
    create_scratch_database(settings.database_admin_url, scratch)
    scratch_url = replace_database_in_url(settings.database_admin_url, scratch)
    try:
        extracted = backup_settings["backup_dir"] / "extract"
        extracted.mkdir()
        manifest = extract_backup_bundle(artifact, extracted)
        assert isinstance(manifest, BackupManifest)
        run_pg_restore(scratch_url, str(extracted / DATABASE_DUMP_NAME))
        verify_restored_database(scratch_url, uploads_root=extracted / UPLOADS_DIR_NAME)
    finally:
        drop_scratch_database(settings.database_admin_url, scratch)


@requires_pg_tools
def test_verify_latest_backup_service(db_session, restaurant_a, backup_settings) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    db_session.commit()

    service.run_backup(timestamp="20260622T130000Z")
    verify = service.verify_latest_backup()
    assert verify.checks_passed is True


def test_has_backup_on_utc_date(tmp_path, monkeypatch) -> None:
    root = tmp_path / "backups"
    root.mkdir()
    monkeypatch.setattr(settings, "backup_local_dir", str(root))
    monkeypatch.setattr(settings, "backup_s3_bucket", None)

    day = date(2026, 8, 3)
    ts = "20260803T140000Z"
    (root / f"mizan-backup-{ts}.tar.gz").write_bytes(b"x")

    assert service.has_backup_on_utc_date(day) is True
    assert service.has_backup_on_utc_date(date(2026, 8, 2)) is False


def test_daily_backup_skips_when_already_backed_up_today(tmp_path, monkeypatch) -> None:
    from app.features.backups import tasks as backup_tasks

    root = tmp_path / "backups"
    root.mkdir()
    monkeypatch.setattr(settings, "backup_local_dir", str(root))
    monkeypatch.setattr(settings, "backup_s3_bucket", None)

    today = datetime.now(UTC).date()
    ts = datetime.combine(today, datetime.min.time(), tzinfo=UTC).strftime(
        "%Y%m%dT%H%M%SZ"
    )
    (root / f"mizan-backup-{ts}.tar.gz").write_bytes(b"x")

    called: list[str] = []

    def fail_run() -> None:
        called.append("run")
        raise AssertionError("run_backup should be skipped")

    monkeypatch.setattr(service, "run_backup", fail_run)
    monkeypatch.setattr(service, "verify_latest_backup", lambda: (_ for _ in ()).throw(AssertionError()))
    monkeypatch.setattr(service, "prune_old_backups", lambda: ["old.tar.gz"])

    result = backup_tasks.run_daily_backup.run()
    assert result["skipped"] is True
    assert result["reason"] == "already_backed_up_today"
    assert result["pruned"] == ["old.tar.gz"]
    assert called == []


def test_manual_backup_task_runs_upload_only(monkeypatch) -> None:
    from app.features.backups import tasks as backup_tasks
    from app.features.backups.schema import BackupRunResult

    monkeypatch.setattr(
        service,
        "run_backup",
        lambda: BackupRunResult(
            artifact_key="mizan-backup-20260803T120000Z.tar.gz",
            timestamp="20260803T120000Z",
            git_tag="v0.test",
            sha256="abc",
            row_counts={"entities": 1},
        ),
    )
    verify_called = {"n": 0}
    monkeypatch.setattr(
        service,
        "verify_latest_backup",
        lambda: verify_called.__setitem__("n", verify_called["n"] + 1),
    )

    result = backup_tasks.run_manual_backup.run()
    assert result["artifact_key"] == "mizan-backup-20260803T120000Z.tar.gz"
    assert verify_called["n"] == 0


def test_enqueue_manual_backup_api(client, restaurant_a, monkeypatch) -> None:
    from app.features.backups import api as backup_api

    monkeypatch.setattr(backup_api, "_last_manual_enqueue_monotonic", None)

    class FakeAsyncResult:
        id = "task-123"

    monkeypatch.setattr(
        backup_api.run_manual_backup,
        "delay",
        lambda: FakeAsyncResult(),
    )

    response = client.post(f"/entities/{restaurant_a.id}/backups/run")
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "started"
    assert body["task_id"] == "task-123"


def test_enqueue_manual_backup_debounced(client, restaurant_a, monkeypatch) -> None:
    from app.features.backups import api as backup_api

    class FakeAsyncResult:
        id = "task-456"

    monkeypatch.setattr(
        backup_api.run_manual_backup,
        "delay",
        lambda: FakeAsyncResult(),
    )
    monkeypatch.setattr(backup_api, "_last_manual_enqueue_monotonic", None)

    assert client.post(f"/entities/{restaurant_a.id}/backups/run").status_code == 202
    second = client.post(f"/entities/{restaurant_a.id}/backups/run")
    assert second.status_code == 429


def test_prune_removes_old_local_backups(tmp_path, monkeypatch) -> None:
    root = tmp_path / "backups"
    root.mkdir()
    storage = LocalBackupStorage(root)
    today = datetime.now(UTC).date()

    for day in range(25):
        moment = today - timedelta(days=day)
        ts = datetime.combine(moment, datetime.min.time(), tzinfo=UTC).strftime("%Y%m%dT%H%M%SZ")
        (root / f"mizan-backup-{ts}.tar.gz").write_bytes(b"x")

    monkeypatch.setattr(settings, "backup_retention_daily_days", 14)
    monkeypatch.setattr(settings, "backup_retention_weekly_weeks", 2)
    removed = storage.prune()
    remaining = {item.key for item in storage.list_backups()}
    keep = retention_keys_to_keep(
        [item.key for item in storage.list_backups()] + removed,
        daily_days=14,
        weekly_weeks=2,
        as_of=today,
    )
    assert remaining == keep
    assert len(removed) > 0
