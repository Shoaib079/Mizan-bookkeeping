#!/usr/bin/env python3
"""Restore local Homebrew Postgres from a Mizan backup artifact (R2 or local file).

Replaces the local ``mizan`` database — never point DATABASE_URL at Neon/production.

Usage:
  cd backend && source .venv/bin/activate
  python scripts/restore_local_from_backup.py --yes
  python scripts/restore_local_from_backup.py --artifact ~/Downloads/mizan-backup-....tar.gz --yes
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from sqlalchemy import create_engine, text

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.adapters.backup.archive import (  # noqa: E402
    DATABASE_DUMP_NAME,
    UPLOADS_DIR_NAME,
    extract_backup_bundle,
)
from app.adapters.backup.postgres import (  # noqa: E402
    parse_database_name,
    pg_tools_available,
    replace_database_in_url,
    run_pg_restore,
)
from app.adapters.backup.storage import get_backup_storage  # noqa: E402
from app.config import settings  # noqa: E402


def _drop_and_recreate_local_db(db_name: str) -> None:
    admin_url = settings.database_cluster_admin_url
    engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    safe_name = db_name.replace('"', "")
    with engine.connect() as conn:
        conn.execute(
            text(
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = :name AND pid <> pg_backend_pid()
                """
            ),
            {"name": safe_name},
        )
        conn.execute(text(f'DROP DATABASE IF EXISTS "{safe_name}"'))
        conn.execute(text(f'CREATE DATABASE "{safe_name}" OWNER mizan_app'))
    engine.dispose()


def _run_migrations() -> None:
    alembic = BACKEND_ROOT / ".venv" / "bin" / "alembic"
    if not alembic.exists():
        alembic = Path("alembic")
    subprocess.run(
        [str(alembic), "upgrade", "head"],
        cwd=BACKEND_ROOT,
        check=True,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Restore local mizan database from Cloudflare R2 or a backup file",
    )
    parser.add_argument(
        "--artifact",
        type=Path,
        help="Path to mizan-backup-*.tar.gz (skip R2 download)",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip confirmation prompt",
    )
    parser.add_argument(
        "--skip-uploads",
        action="store_true",
        help="Do not copy uploads/ from the artifact",
    )
    parser.add_argument(
        "--skip-migrate",
        action="store_true",
        help="Skip alembic upgrade head after restore",
    )
    args = parser.parse_args(argv)

    if not pg_tools_available():
        print("ERROR: install PostgreSQL client tools (pg_restore).", file=sys.stderr)
        return 1

    db_name = parse_database_name(settings.database_url)
    if db_name in {"postgres", "mizan_test"}:
        print(f"ERROR: refusing to restore into database {db_name!r}", file=sys.stderr)
        return 1

    host = settings.database_url
    if "neon" in host.lower() or "railway" in host.lower():
        print(
            "ERROR: DATABASE_URL looks like cloud Postgres. "
            "Set local DATABASE_URL in backend/.env first.",
            file=sys.stderr,
        )
        return 1

    artifact_path: Path
    artifact_key: str

    if args.artifact:
        artifact_path = args.artifact.expanduser().resolve()
        if not artifact_path.is_file():
            print(f"ERROR: file not found: {artifact_path}", file=sys.stderr)
            return 1
        artifact_key = artifact_path.name
    else:
        if not settings.backup_s3_bucket:
            print(
                "ERROR: no --artifact path and BACKUP_S3_BUCKET is not set in backend/.env.\n"
                "Either download mizan-backup-*.tar.gz from Cloudflare R2 dashboard,\n"
                "or copy BACKUP_S3_* from Railway worker env into backend/.env.",
                file=sys.stderr,
            )
            return 1
        storage = get_backup_storage()
        key = storage.latest_key()
        if key is None:
            print("ERROR: no backups found in R2 bucket.", file=sys.stderr)
            return 1
        artifact_key = key
        artifact_path = Path(tempfile.gettempdir()) / key
        print(f"Downloading {key} from R2 …")
        storage.download(key, artifact_path)
        print(f"Saved to {artifact_path}")

    if not args.yes:
        print()
        print(f"This will REPLACE local database '{db_name}' with backup:")
        print(f"  {artifact_key}")
        print("Stop uvicorn / any local API first.")
        confirm = input("Type yes to continue: ").strip().lower()
        if confirm != "yes":
            print("Aborted.")
            return 1

    with tempfile.TemporaryDirectory(prefix="mizan-local-restore-") as workdir:
        work = Path(workdir)
        extracted = work / "extracted"
        print("Extracting …")
        manifest = extract_backup_bundle(artifact_path, extracted)
        print(f"Backup from {manifest.timestamp} (tag {manifest.git_tag})")

        dump_path = extracted / DATABASE_DUMP_NAME
        if not dump_path.is_file():
            print(f"ERROR: missing {DATABASE_DUMP_NAME} in artifact", file=sys.stderr)
            return 1

        print(f"Recreating local database {db_name} …")
        _drop_and_recreate_local_db(db_name)

        restore_url = replace_database_in_url(settings.database_cluster_admin_url, db_name)
        print("Running pg_restore (warnings about existing objects are normal) …")
        run_pg_restore(restore_url, str(dump_path))

        if not args.skip_uploads:
            uploads_src = extracted / UPLOADS_DIR_NAME
            uploads_dest = Path(settings.upload_dir)
            if uploads_src.is_dir() and any(uploads_src.iterdir()):
                uploads_dest.mkdir(parents=True, exist_ok=True)
                for item in uploads_src.iterdir():
                    dest = uploads_dest / item.name
                    if item.is_dir():
                        if dest.exists():
                            shutil.rmtree(dest)
                        shutil.copytree(item, dest)
                    else:
                        shutil.copy2(item, dest)
                print(f"Copied uploads to {uploads_dest.resolve()}")
            else:
                print("No uploads in artifact (skipped).")

    if not args.skip_migrate:
        print("Running alembic upgrade head …")
        _run_migrations()

    print()
    print("Done. Start the app:")
    print("  cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000")
    print("  cd frontend && npm run dev")
    print()
    print("Ensure backend/.env has AUTH_ENFORCEMENT=false for local sign-in bypass.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
