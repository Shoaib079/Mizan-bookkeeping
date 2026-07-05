"""Backup orchestration — run, verify, prune (Phase 8)."""

from __future__ import annotations

import subprocess
import shutil
import tempfile
from pathlib import Path

from app.adapters.backup.archive import (
    DATABASE_DUMP_NAME,
    UPLOADS_DIR_NAME,
    create_backup_bundle,
    extract_backup_bundle,
    utc_timestamp_label,
)
from app.adapters.backup.postgres import (
    collect_row_counts,
    create_scratch_database,
    drop_scratch_database,
    parse_database_name,
    pg_tools_available,
    replace_database_in_url,
    run_pg_dump,
    run_pg_restore,
    scratch_database_name,
)
from app.adapters.storage import prepare_uploads_for_backup
from app.adapters.backup.storage import get_backup_storage
from app.config import settings
from app.features.backups.integrity import verify_restored_database
from app.features.backups.schema import BackupRunResult, BackupVerifyResult


def _backup_database_url() -> str:
    """Admin credentials for pg_dump/pg_restore (bypasses FORCE RLS on app tables)."""
    db_name = parse_database_name(settings.database_url)
    return replace_database_in_url(settings.database_admin_url, db_name)


def resolve_git_tag() -> str:
    try:
        result = subprocess.run(
            ["git", "describe", "--tags", "--always"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        return "unknown"


def run_backup(*, timestamp: str | None = None) -> BackupRunResult:
    if not pg_tools_available():
        raise RuntimeError("pg_dump/pg_restore not found in PATH")

    ts = timestamp or utc_timestamp_label()
    git_tag = resolve_git_tag()
    backup_url = _backup_database_url()
    row_counts = collect_row_counts(backup_url).as_dict()
    uploads_root = Path(settings.upload_dir)
    storage = get_backup_storage()

    with tempfile.TemporaryDirectory(prefix="mizan-backup-run-") as workdir:
        work = Path(workdir)
        staging_uploads = work / "uploads"
        if uploads_root.exists() and any(uploads_root.iterdir()):
            shutil.copytree(uploads_root, staging_uploads, dirs_exist_ok=True)
        else:
            staging_uploads.mkdir(parents=True, exist_ok=True)
        prepare_uploads_for_backup(staging_uploads)
        dump_path = work / DATABASE_DUMP_NAME
        run_pg_dump(backup_url, str(dump_path))
        artifact_path, manifest = create_backup_bundle(
            dump_path=dump_path,
            uploads_root=staging_uploads,
            git_tag=git_tag,
            row_counts=row_counts,
            output_dir=work,
            timestamp=ts,
        )
        key = storage.upload(artifact_path, timestamp=ts)

    return BackupRunResult(
        artifact_key=key,
        timestamp=manifest.timestamp,
        git_tag=manifest.git_tag,
        sha256=manifest.sha256,
        row_counts=manifest.row_counts,
    )


def verify_latest_backup() -> BackupVerifyResult:
    storage = get_backup_storage()
    key = storage.latest_key()
    if key is None:
        raise RuntimeError("no backups available to verify")

    scratch_name = scratch_database_name()
    admin_url = settings.database_admin_url
    create_scratch_database(admin_url, scratch_name)
    scratch_url = replace_database_in_url(admin_url, scratch_name)

    try:
        with tempfile.TemporaryDirectory(prefix="mizan-backup-verify-") as workdir:
            work = Path(workdir)
            artifact_path = work / key
            storage.download(key, artifact_path)
            extracted = work / "extracted"
            extract_backup_bundle(artifact_path, extracted)
            run_pg_restore(scratch_url, str(extracted / DATABASE_DUMP_NAME))
            verify_restored_database(
                scratch_url,
                uploads_root=extracted / UPLOADS_DIR_NAME,
            )
    finally:
        drop_scratch_database(admin_url, scratch_name)

    return BackupVerifyResult(
        artifact_key=key,
        scratch_database=scratch_name,
        checks_passed=True,
        message="restore verification passed",
    )


def prune_old_backups() -> list[str]:
    return get_backup_storage().prune()
