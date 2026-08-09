"""Run the books health checks and print a report (HARDENING_PLAN.md Phase 0).

    python -m app.core.health.cli              # every restaurant
    python -m app.core.health.cli --entity <id>
    python -m app.core.health.cli --fail-on critical

Safe to point at production: nothing here writes. The exit code is 0 whatever
it finds unless `--fail-on` is given, so running it can never be the thing
that breaks a deploy — you decide what counts as a stop.

Read the report before the refactor and again after. Two identical reports
either side of a move are better evidence the move changed nothing than any
number of green tests, because they are taken from the real books rather than
from fixtures someone wrote to agree with the code.
"""

from __future__ import annotations

import argparse
import sys
import uuid

from sqlalchemy import select

from app.core.health.books_health import SEVERITIES, Finding, run_books_health
from app.db.session import SessionLocal
from app.features.entities.models import Entity


def _format(entity_name: str, findings: list[Finding]) -> str:
    if not findings:
        return f"  {entity_name}: clean"

    lines = [f"  {entity_name}: {len(findings)} finding(s)"]
    current = None
    for finding in findings:
        if finding.severity != current:
            current = finding.severity
            lines.append(f"    [{current}]")
        lines.append(f"      {finding.check}  {finding.subject}")
        lines.append(f"          {finding.detail}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Read-only consistency checks over the books. Writes nothing."
    )
    parser.add_argument(
        "--entity",
        help="One entity id. Default: every entity.",
    )
    parser.add_argument(
        "--fail-on",
        choices=SEVERITIES,
        help="Exit non-zero when a finding at this severity or worse appears.",
    )
    args = parser.parse_args(argv)

    session = SessionLocal()
    try:
        if args.entity:
            entity = session.get(Entity, uuid.UUID(args.entity))
            if entity is None:
                print(f"no entity {args.entity}", file=sys.stderr)
                return 2
            entities = [(entity.id, entity.name)]
        else:
            entities = [
                (row.id, row.name)
                for row in session.scalars(select(Entity).order_by(Entity.name))
            ]

        print(f"Books health — {len(entities)} restaurant(s)\n")
        worst_rank = len(SEVERITIES)
        total = 0
        for entity_id, name in entities:
            findings = run_books_health(session, entity_id)
            total += len(findings)
            print(_format(name, findings))
            print()
            for finding in findings:
                worst_rank = min(worst_rank, SEVERITIES.index(finding.severity))

        print(f"{total} finding(s) across {len(entities)} restaurant(s)")
        if total:
            # Said plainly: the tool reports, a person decides. Nothing here
            # corrects what it finds — a tool that fixes things cannot be run
            # in a panic, because afterwards you cannot tell what it changed.
            print("Nothing was changed. Each finding needs its own decision.")

        if args.fail_on and worst_rank <= SEVERITIES.index(args.fail_on):
            return 1
        return 0
    finally:
        session.close()


if __name__ == "__main__":  # pragma: no cover - entrypoint
    raise SystemExit(main())
