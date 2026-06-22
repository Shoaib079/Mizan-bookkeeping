"""Backup bundle — tar archive, manifest, checksums (Phase 8)."""

from __future__ import annotations

import hashlib
import json
import shutil
import tarfile
import tempfile
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

MANIFEST_NAME = "manifest.json"
DATABASE_DUMP_NAME = "database.dump"
UPLOADS_DIR_NAME = "uploads"


@dataclass(frozen=True, slots=True)
class BackupManifest:
    timestamp: str
    git_tag: str
    row_counts: dict[str, int]
    sha256: str
    database_file: str = DATABASE_DUMP_NAME
    uploads_dir: str = UPLOADS_DIR_NAME

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, sort_keys=True)

    @classmethod
    def from_json(cls, raw: str) -> BackupManifest:
        data = json.loads(raw)
        return cls(
            timestamp=data["timestamp"],
            git_tag=data["git_tag"],
            row_counts=dict(data["row_counts"]),
            sha256=data["sha256"],
            database_file=data.get("database_file", DATABASE_DUMP_NAME),
            uploads_dir=data.get("uploads_dir", UPLOADS_DIR_NAME),
        )


def utc_timestamp_label(when: datetime | None = None) -> str:
    moment = when or datetime.now(UTC)
    return moment.strftime("%Y%m%dT%H%M%SZ")


def artifact_filename(timestamp: str) -> str:
    return f"mizan-backup-{timestamp}.tar.gz"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _content_checksum(staging: Path) -> str:
    """SHA256 over dump bytes and every file under uploads/ (sorted paths)."""
    digest = hashlib.sha256()
    dump_path = staging / DATABASE_DUMP_NAME
    if dump_path.exists():
        digest.update(dump_path.read_bytes())
    uploads = staging / UPLOADS_DIR_NAME
    if uploads.exists():
        for path in sorted(p for p in uploads.rglob("*") if p.is_file()):
            digest.update(str(path.relative_to(uploads)).encode("utf-8"))
            digest.update(path.read_bytes())
    return digest.hexdigest()


def create_backup_bundle(
    *,
    dump_path: Path,
    uploads_root: Path,
    git_tag: str,
    row_counts: dict[str, int],
    output_dir: Path,
    timestamp: str | None = None,
) -> tuple[Path, BackupManifest]:
    """Bundle db dump + uploads + manifest into one timestamped tar.gz artifact."""
    ts = timestamp or utc_timestamp_label()
    output_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = output_dir / artifact_filename(ts)

    with tempfile.TemporaryDirectory(prefix="mizan-backup-staging-") as staging_name:
        staging = Path(staging_name)
        shutil.copy2(dump_path, staging / DATABASE_DUMP_NAME)
        uploads_dest = staging / UPLOADS_DIR_NAME
        if uploads_root.exists() and any(uploads_root.iterdir()):
            shutil.copytree(uploads_root, uploads_dest, dirs_exist_ok=True)
        else:
            uploads_dest.mkdir(parents=True, exist_ok=True)

        checksum = _content_checksum(staging)
        manifest = BackupManifest(
            timestamp=ts,
            git_tag=git_tag,
            row_counts=row_counts,
            sha256=checksum,
        )
        (staging / MANIFEST_NAME).write_text(manifest.to_json(), encoding="utf-8")

        with tarfile.open(artifact_path, "w:gz") as archive:
            for item in sorted(staging.iterdir()):
                archive.add(item, arcname=item.name)

    return artifact_path, manifest


def extract_backup_bundle(artifact_path: Path, dest_dir: Path) -> BackupManifest:
    dest_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(artifact_path, "r:gz") as archive:
        archive.extractall(dest_dir, filter="data")
    manifest_path = dest_dir / MANIFEST_NAME
    if not manifest_path.exists():
        raise ValueError(f"missing {MANIFEST_NAME} in backup artifact")
    manifest = BackupManifest.from_json(manifest_path.read_text(encoding="utf-8"))
    actual = _content_checksum(dest_dir)
    if manifest.sha256 != actual:
        raise ValueError(
            f"checksum mismatch: manifest {manifest.sha256!r} != content {actual!r}"
        )
    return manifest


def verify_manifest_checksum(extracted_dir: Path, manifest: BackupManifest) -> None:
    actual = _content_checksum(extracted_dir)
    if manifest.sha256 != actual:
        raise ValueError(
            f"checksum mismatch: manifest {manifest.sha256!r} != content {actual!r}"
        )
