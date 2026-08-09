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


class SchemaBehindError(RuntimeError):
    """The database is older than the code reading it."""


def _require_current_schema(session) -> None:
    """Fail with a sentence, not a stack trace.

    A tool meant to be reached for when something looks wrong should not
    answer a stale local database with sixty lines of SQLAlchemy. The first
    real run of this hit exactly that: `column entities.address does not
    exist`, because the branding migration had never been applied locally.

    Checked by reading one row of the table every later query joins from, so
    the failure happens here with an explanation rather than five checks in.
    """
    from sqlalchemy import select
    from sqlalchemy.exc import ProgrammingError

    from app.features.entities.models import Entity

    try:
        session.execute(select(Entity).limit(1)).first()
    except ProgrammingError as exc:
        session.rollback()
        raise SchemaBehindError(
            "This database is behind the code — a column the models expect is "
            "missing.\n"
            f"  {str(exc.orig).strip().splitlines()[0]}\n\n"
            "Bring it up to date, then run this again:\n"
            "  cd backend && .venv/bin/alembic upgrade head\n\n"
            "Production migrates itself on deploy (render.yaml preDeployCommand "
            "→ scripts/migrate_production.sh), so this is normally a local "
            "database that has not caught up."
        ) from exc


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


def _resolve_entity(session, given: str) -> tuple[uuid.UUID, str] | None:
    """A restaurant by name or by id.

    By name because that is how they are actually referred to — nobody holds
    a UUID in their head, and asking for one turns a two-second question into
    a database lookup first.
    """
    try:
        entity = session.get(Entity, uuid.UUID(given))
        return (entity.id, entity.name) if entity else None
    except ValueError:
        pass

    matches = list(
        session.scalars(select(Entity).where(Entity.name.ilike(f"%{given}%")))
    )
    if len(matches) == 1:
        return (matches[0].id, matches[0].name)
    if len(matches) > 1:
        names = ", ".join(m.name for m in matches)
        print(f"{given!r} matches several: {names}", file=sys.stderr)
    return None


def _money(kurus: int) -> str:
    """Kuruş as lira, because the numbers here are read by a person."""
    sign = "-" if kurus < 0 else ""
    whole, frac = divmod(abs(kurus), 100)
    return f"{sign}{whole:,}".replace(",", ".") + f",{frac:02d} ₺"


def _print_entries(
    session, entity: tuple[uuid.UUID, str], account_code: str, source: str | None
) -> None:
    """The individual lines behind a total, so a mismatch can be dated.

    Totals answer "what kind of thing is on this account". They cannot answer
    "when did it get there", which is the question that separates a live bug
    from an old one already fixed.
    """
    from app.core.health.books_health import account_entries

    entity_id, name = entity
    wanted = {source} if source else None
    rows = account_entries(session, entity_id, account_code, sources=wanted)

    heading = f"{name} — entries on {account_code}"
    if source:
        heading += f", source {source}"
    print(f"{heading}\n")

    if not rows:
        print("    (nothing matched)")
        return
    for row in rows:
        print(
            f"    {row.entry_date}  {row.source:34} {_money(row.signed_kurus):>18}"
            f"  {row.description[:48]}"
        )


def _print_explanation(session, entity: tuple[uuid.UUID, str], account_code: str) -> None:
    """Both sides of a control-account tie, side by side.

    A tie failure says two numbers differ. What is worth seeing is which
    movements each side counts — that is what tells you whether the books
    drifted or the check is measuring the wrong thing.
    """
    from app.core.health.books_health import explain_account

    entity_id, name = entity
    by_movement, by_source = explain_account(session, entity_id, account_code)

    print(f"{name} — account {account_code}\n")

    print("  Subledger, by movement type")
    if not by_movement:
        print("    (no partner ledger rows)")
    for movement, total in by_movement:
        print(f"    {movement:28} {_money(total):>18}")

    print("\n  General ledger, by what posted it (credit positive)")
    if not by_source:
        print("    (nothing posted to this account)")
    for source, total in by_source:
        print(f"    {source:28} {_money(total):>18}")

    print(
        "\n  A movement type that appears above but is not counted by the tie "
        "is the\n  usual answer: the check measuring something narrower than "
        "the account."
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Read-only consistency checks over the books. Writes nothing."
    )
    parser.add_argument(
        "--entity",
        help="One restaurant, by name or id. Default: every restaurant.",
    )
    parser.add_argument(
        "--explain",
        metavar="ACCOUNT_CODE",
        help=(
            "Instead of the report: break one control account down by "
            "subledger movement type and by journal source, so a tie "
            "mismatch can be read. Needs --entity. Example: --explain 3300"
        ),
    )
    parser.add_argument(
        "--entries",
        action="store_true",
        help=(
            "With --explain: list the individual journal lines on the account "
            "rather than the totals, newest first, so a mismatch can be dated. "
            "Narrow it with --source."
        ),
    )
    parser.add_argument(
        "--source",
        metavar="JOURNAL_SOURCE",
        help="With --entries: only this journal source. Example: --source partner_drawing",
    )
    parser.add_argument(
        "--fail-on",
        choices=SEVERITIES,
        help="Exit non-zero when a finding at this severity or worse appears.",
    )
    args = parser.parse_args(argv)

    session = SessionLocal()
    try:
        _require_current_schema(session)
    except SchemaBehindError as exc:
        print(str(exc), file=sys.stderr)
        session.close()
        return 3

    try:
        if args.entity:
            resolved = _resolve_entity(session, args.entity)
            if resolved is None:
                print(f"no restaurant matching {args.entity!r}", file=sys.stderr)
                return 2
            entities = [resolved]
        else:
            entities = [
                (row.id, row.name)
                for row in session.scalars(select(Entity).order_by(Entity.name))
            ]

        if args.entries and not args.explain:
            print("--entries needs --explain ACCOUNT_CODE", file=sys.stderr)
            return 2

        if args.explain:
            if not args.entity:
                print("--explain needs --entity", file=sys.stderr)
                return 2
            if args.entries:
                _print_entries(session, entities[0], args.explain, args.source)
            else:
                _print_explanation(session, entities[0], args.explain)
            return 0

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
