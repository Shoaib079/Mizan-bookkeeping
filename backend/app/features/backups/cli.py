"""CLI entrypoint for manual backup operations (Phase 8)."""

from __future__ import annotations

import argparse
import sys

from app.features.backups import service


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Mizan backup operations")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("run", help="Create and upload a backup artifact")
    sub.add_parser("verify", help="Restore latest backup into scratch DB and verify")
    sub.add_parser("prune", help="Apply retention policy to stored backups")

    args = parser.parse_args(argv)

    if args.command == "run":
        result = service.run_backup()
        print(
            f"backup {result.artifact_key} tag={result.git_tag} sha256={result.sha256}"
        )
        return 0
    if args.command == "verify":
        result = service.verify_latest_backup()
        print(result.message)
        return 0
    if args.command == "prune":
        removed = service.prune_old_backups()
        print(f"pruned {len(removed)} backup(s)")
        for key in removed:
            print(key)
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
