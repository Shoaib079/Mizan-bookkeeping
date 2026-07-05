"""Backup storage — local filesystem and S3-compatible with retention (Phase 8)."""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from app.adapters.backup.archive import artifact_filename
from app.adapters.backup.s3_client import build_s3_client
from app.config import settings

_BACKUP_KEY_RE = re.compile(r"mizan-backup-(\d{8}T\d{6}Z)\.tar\.gz$")


@dataclass(frozen=True, slots=True)
class StoredBackup:
    key: str
    timestamp: datetime
    path: Path | None = None


def parse_backup_timestamp(key: str) -> datetime | None:
    match = _BACKUP_KEY_RE.search(key)
    if not match:
        return None
    return datetime.strptime(match.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)


def retention_keys_to_keep(
    keys: list[str],
    *,
    daily_days: int,
    weekly_weeks: int,
    as_of: date | None = None,
) -> set[str]:
    """Keep daily backups for ``daily_days`` and one weekly backup per ISO week."""
    today = as_of or datetime.now(UTC).date()
    daily_cutoff = today - timedelta(days=daily_days - 1)
    weekly_cutoff = today - timedelta(weeks=weekly_weeks)

    parsed: list[tuple[str, date]] = []
    for key in keys:
        moment = parse_backup_timestamp(key)
        if moment is None:
            continue
        parsed.append((key, moment.date()))

    keep: set[str] = set()
    weekly_best: dict[tuple[int, int], tuple[str, date]] = {}

    for key, backup_date in sorted(parsed, key=lambda item: item[1], reverse=True):
        if backup_date >= daily_cutoff:
            keep.add(key)
            continue
        if backup_date < weekly_cutoff:
            continue
        iso = backup_date.isocalendar()
        week_key = (iso.year, iso.week)
        current = weekly_best.get(week_key)
        if current is None or backup_date > current[1]:
            weekly_best[week_key] = (key, backup_date)

    keep.update(key for key, _ in weekly_best.values())
    return keep


class BackupStorage(ABC):
    @abstractmethod
    def upload(self, local_path: Path, *, timestamp: str) -> str:
        raise NotImplementedError

    @abstractmethod
    def download(self, key: str, dest_path: Path) -> None:
        raise NotImplementedError

    @abstractmethod
    def list_backups(self) -> list[StoredBackup]:
        raise NotImplementedError

    @abstractmethod
    def delete(self, key: str) -> None:
        raise NotImplementedError

    def prune(self) -> list[str]:
        keys = [item.key for item in self.list_backups()]
        keep = retention_keys_to_keep(
            keys,
            daily_days=settings.backup_retention_daily_days,
            weekly_weeks=settings.backup_retention_weekly_weeks,
        )
        removed: list[str] = []
        for key in keys:
            if key not in keep:
                self.delete(key)
                removed.append(key)
        return removed

    def latest_key(self) -> str | None:
        backups = self.list_backups()
        if not backups:
            return None
        return max(backups, key=lambda item: item.timestamp).key


class LocalBackupStorage(BackupStorage):
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or Path(settings.backup_local_dir)
        self.root.mkdir(parents=True, exist_ok=True)

    def upload(self, local_path: Path, *, timestamp: str) -> str:
        key = artifact_filename(timestamp)
        dest = self.root / key
        dest.write_bytes(local_path.read_bytes())
        return key

    def download(self, key: str, dest_path: Path) -> None:
        source = self.root / key
        if not source.exists():
            raise FileNotFoundError(key)
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        dest_path.write_bytes(source.read_bytes())

    def list_backups(self) -> list[StoredBackup]:
        items: list[StoredBackup] = []
        for path in sorted(self.root.glob("mizan-backup-*.tar.gz")):
            moment = parse_backup_timestamp(path.name)
            if moment is None:
                continue
            items.append(StoredBackup(key=path.name, timestamp=moment, path=path))
        return items

    def delete(self, key: str) -> None:
        path = self.root / key
        if path.exists():
            path.unlink()


class S3BackupStorage(BackupStorage):
    def __init__(self) -> None:
        if not settings.backup_s3_bucket:
            raise RuntimeError("backup_s3_bucket is required for S3 storage")
        self._bucket = settings.backup_s3_bucket
        self._prefix = settings.backup_s3_prefix.strip("/")
        self._client = build_s3_client()

    def _object_key(self, key: str) -> str:
        if self._prefix:
            return f"{self._prefix}/{key}"
        return key

    def upload(self, local_path: Path, *, timestamp: str) -> str:
        key = artifact_filename(timestamp)
        extra_args = {"ServerSideEncryption": "AES256"}
        self._client.upload_file(
            str(local_path),
            self._bucket,
            self._object_key(key),
            ExtraArgs=extra_args,
        )
        return key

    def download(self, key: str, dest_path: Path) -> None:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        self._client.download_file(self._bucket, self._object_key(key), str(dest_path))

    def list_backups(self) -> list[StoredBackup]:
        items: list[StoredBackup] = []
        prefix = f"{self._prefix}/" if self._prefix else ""
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                raw_key = obj["Key"]
                basename = raw_key.split("/")[-1]
                moment = parse_backup_timestamp(basename)
                if moment is None:
                    continue
                items.append(StoredBackup(key=basename, timestamp=moment))
        return items

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=self._object_key(key))


def get_backup_storage() -> BackupStorage:
    if settings.backup_s3_bucket:
        return S3BackupStorage()
    return LocalBackupStorage()
