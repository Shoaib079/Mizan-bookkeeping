"""Delete one restaurant and everything belonging to it. Irreversible.

    python -m scripts.delete_entity "Spice Corner"                    # shows only
    python -m scripts.delete_entity "Spice Corner" --confirm "Spice Corner"

**Read this before using it.**

The ledger is deliberately undeletable. `journal_entries`, `journal_entry_lines`,
the four subledgers, `period_locks` and the audit tables each carry a trigger
that aborts a DELETE. That is not an oversight to work around casually — it is
the property the rest of the app rests on, and it is why voiding an entry
leaves a reversal behind instead of removing anything.

The delete itself is `delete_entity_cascade()` in the database — the same
function the Settings button calls. It stands the triggers down for one
transaction, deletes the entity row, lets `ON DELETE CASCADE` carry the rest
away, and puts them back; if anything fails the transaction rolls back and
takes the disabled window with it. This script is the guards around that call,
not a second copy of it.

It exists for one honest case: a practice restaurant, set up to learn the app,
full of deliberate mistakes, that its owner wants gone so they can start
again. It is **not** for closing a real business — Turkish law wants those
books kept for years after trading stops, and the tool for that is an archive
flag, not this.

Guards, because this has no undo:

  - Nothing happens without `--confirm` naming the restaurant exactly.
  - It refuses if the name matches more than one restaurant.
  - It refuses if there is no backup from today.
  - It refuses to delete the last remaining restaurant.
  - It prints everything it is about to destroy first.
"""

from __future__ import annotations

import argparse
import sys
import uuid
from datetime import UTC, datetime

from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db.entity_deletion import (
    DELETE_ENTITY_FUNCTION,
    entity_deletion_function_present,
)
from app.features.entities.models import Entity


def _wrong_database(session: Session) -> str | None:
    """Complain if the owner connection is not the database the app uses.

    This script needs `DATABASE_ADMIN_URL`, because the app's own role cannot
    disable a trigger. Two separate variables mean they can disagree, and the
    quiet version of that is setting only `DATABASE_URL` to production and
    having the admin URL fall back to its localhost default — pointing this at
    a local database while believing it is pointed at the live one.

    Compared on host, port and database name. Usernames are expected to differ;
    that is the whole reason there are two URLs.
    """
    from sqlalchemy.engine import make_url

    expected = make_url(
        settings.test_database_url if settings.app_env == "test" else settings.database_url
    )
    actual = session.get_bind().url
    where = lambda url: (url.host, url.port, url.database)  # noqa: E731
    if where(expected) == where(actual):
        return None
    return (
        f"the app uses {expected.host}:{expected.port}/{expected.database}, "
        f"but this connected to {actual.host}:{actual.port}/{actual.database}"
    )


def _open_session() -> Session:
    """A session as the schema owner, not as the application role.

    `mizan_app` holds DML rights and nothing more — by design, and the comment
    in `conftest.py` says so out loud: "Migrations run as admin (table owner);
    mizan_app gets DML only." `ALTER TABLE … DISABLE TRIGGER` needs ownership,
    so run as the same role Alembic does.
    """
    url = (
        settings.test_database_admin_url
        if settings.app_env == "test"
        else settings.database_migration_url
    )
    return sessionmaker(bind=create_engine(url, pool_pre_ping=True))()

#: Triggers that fire on DELETE, read from `pg_trigger` rather than listed here.
#:
#: A list would have been wrong twice over in the writing of this file alone: it
#: called the period-lock trigger `period_locks_immutable` (it is
#: `period_locks_no_delete`) and it missed `journal_entries_restrict_update`
#: entirely, which fires on UPDATE *or* DELETE and so blocks this just as hard.
#: Both mistakes would have surfaced as a delete that failed halfway.
#:
#: Reading them from the database also means an immutable table added next year
#: is covered without anyone remembering this file exists.
_DELETE_TRIGGERS = text(
    """
    SELECT c.relname AS table_name, t.tgname AS trigger_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public'
      AND (t.tgtype & 8) <> 0   -- the DELETE bit
    ORDER BY c.relname, t.tgname
    """
)


def _delete_blocking_triggers(session: Session) -> list[tuple[str, str]]:
    return [(row[0], row[1]) for row in session.execute(_DELETE_TRIGGERS)]


def _disabled_triggers(session: Session) -> list[str]:
    """Delete-blocking triggers that are switched off right now.

    Presence in `pg_trigger` says nothing about this: a disabled trigger is
    still listed, it just carries `tgenabled = 'D'`. Checking that the names
    are all still there — which is what this script did at first — would report
    a healthy ledger while every guard on it sat switched off.
    """
    return [
        f"{row[0]}.{row[1]}"
        for row in session.execute(
            text(
                """
                SELECT c.relname, t.tgname
                FROM pg_trigger t
                JOIN pg_class c ON c.oid = t.tgrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE NOT t.tgisinternal
                  AND n.nspname = 'public'
                  AND (t.tgtype & 8) <> 0
                  AND t.tgenabled = 'D'
                ORDER BY c.relname, t.tgname
                """
            )
        )
    ]


def _has_delete_function(session: Session) -> bool:
    """Is the shared delete function installed?

    Checked up front rather than discovered after the confirmation. "function
    does not exist" arriving on the far side of a typed `--confirm` reads like
    the delete went wrong, when in fact it never started.
    """
    return entity_deletion_function_present(session.connection())


def _entity_scoped_tables(session: Session) -> list[str]:
    """Every table carrying an `entity_id`, read from the database itself.

    Not a list in the code, for the same reason as the triggers: a table added
    later would be missing from it, and its rows would quietly survive a delete
    that reported success.
    """
    inspector = inspect(session.get_bind())
    return sorted(
        name
        for name in inspector.get_table_names()
        if any(column["name"] == "entity_id" for column in inspector.get_columns(name))
    )


def _inventory(session: Session, entity_id: uuid.UUID) -> list[tuple[str, int]]:
    """What this restaurant owns, table by table.

    `app.current_entity_id` has to be set first. Almost every one of these
    tables carries `FORCE ROW LEVEL SECURITY`, whose policy matches rows against
    that setting — and *forced* means the table's own owner is subject to it
    too, not exempt as it would normally be.

    Counting without it returned zero for all forty-nine RLS tables. The script
    printed "no data — the restaurant record and nothing else" and would have
    gone on to delete a full set of books anyway, because foreign-key cascades
    are exempt from row-level security even when queries are not. A confirmation
    prompt that under-reports what it is about to destroy is worse than no
    prompt at all.
    """
    session.execute(
        text("SELECT set_config('app.current_entity_id', :entity, true)"),
        {"entity": str(entity_id)},
    )
    counts = []
    for table in _entity_scoped_tables(session):
        count = session.execute(
            text(f"SELECT count(*) FROM {table} WHERE entity_id = :entity"),  # noqa: S608
            {"entity": str(entity_id)},
        ).scalar_one()
        if count:
            counts.append((table, int(count)))
    return sorted(counts, key=lambda row: (-row[1], row[0]))


def _resolve(session: Session, given: str) -> tuple[uuid.UUID, str] | None:
    try:
        found = session.get(Entity, uuid.UUID(given))
    except ValueError:
        pass
    else:
        return (found.id, found.name) if found else None

    matches = list(session.scalars(select(Entity).where(Entity.name.ilike(f"%{given}%"))))
    if len(matches) == 1:
        return (matches[0].id, matches[0].name)
    if len(matches) > 1:
        names = ", ".join(repr(m.name) for m in matches)
        print(f"{given!r} matches more than one restaurant: {names}", file=sys.stderr)
    return None


def _backup_today() -> bool:
    """True if a verified backup exists for today, in UTC.

    Imported here rather than at module scope: the backup service reaches for
    storage configuration, and a `--help` should not need R2 credentials.
    """
    from app.features.backups import service as backups

    return backups.has_backup_on_utc_date(datetime.now(UTC).date())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Delete a restaurant and all of its data. Irreversible."
    )
    parser.add_argument("entity", help="Restaurant name (or id)")
    parser.add_argument(
        "--confirm",
        metavar="EXACT_NAME",
        help="The restaurant's name, spelled exactly, to authorise the delete.",
    )
    parser.add_argument(
        "--i-have-no-backup",
        action="store_true",
        help="Go ahead without a backup from today. Almost never the right call.",
    )
    args = parser.parse_args(argv)

    session = _open_session()
    try:
        mismatch = _wrong_database(session)
        if mismatch:
            print(f"\nWrong database — {mismatch}.", file=sys.stderr)
            print("Set DATABASE_ADMIN_URL as well as DATABASE_URL.", file=sys.stderr)
            return 1

        resolved = _resolve(session, args.entity)
        if resolved is None:
            print(f"No restaurant matching {args.entity!r}.", file=sys.stderr)
            return 2
        entity_id, name = resolved

        if session.scalar(select(func.count()).select_from(Entity)) <= 1:
            print(f"{name} is the only restaurant. Refusing.", file=sys.stderr)
            return 1

        inventory = _inventory(session, entity_id)
        triggers = _delete_blocking_triggers(session)

        print(f"\n{name}")
        print(f"  {entity_id}\n")
        if inventory:
            for table, count in inventory:
                print(f"  {count:>8}  {table}")
            total = sum(count for _, count in inventory)
            print(f"\n  {total:,} rows across {len(inventory)} tables")
        else:
            print("  no data — the restaurant record and nothing else")

        print(f"\n  {len(triggers)} delete-blocking triggers to stand down:")
        for table, trigger in triggers:
            print(f"      {table}.{trigger}")

        if not triggers:
            # Zero means the query stopped matching, not that the ledger became
            # deletable. Deleting on that assumption is how books get lost.
            print("\nNo delete-blocking triggers found at all. That is not")
            print("plausible for this schema — the query is likely broken.")
            print("Refusing.")
            return 1

        if not _has_delete_function(session):
            print(f"\n{DELETE_ENTITY_FUNCTION}() is not in this database.")
            print("Run the migrations first. Refusing.")
            return 1

        if args.confirm != name:
            print("\nNothing was deleted.")
            print(f"To go ahead:  --confirm {name!r}")
            print("There is no undo.")
            return 0

        if not args.i_have_no_backup and not _backup_today():
            print("\nNo verified backup from today. Refusing.")
            print("Take one first, or pass --i-have-no-backup if you accept the risk.")
            return 1

        # The delete itself lives in the database, not here — the same
        # `delete_entity_cascade()` the Settings button calls. Two copies of
        # "disable these triggers, delete, put them back" would drift, and the
        # copy that drifted would be the one nobody ran until the day it
        # mattered.
        #
        # Not `with session.begin()`: the counting above has already opened a
        # transaction implicitly, and asking for a second one raises.
        try:
            deleted = session.execute(
                text(f"SELECT {DELETE_ENTITY_FUNCTION}(:entity)"),
                {"entity": str(entity_id)},
            ).scalar_one()
            session.commit()
        except Exception:
            session.rollback()
            print("\nFailed part-way through. Nothing was deleted and the", file=sys.stderr)
            print("triggers are back — the rollback took them with it.", file=sys.stderr)
            raise

        remaining = _inventory(session, entity_id)
        still_there = session.get(Entity, entity_id)
        left_off = _disabled_triggers(session)

        print(f"\nDeleted {name} ({deleted} entity row).")

        problems = []
        if still_there is not None:
            problems.append("the restaurant record is still there")
        if remaining:
            problems.append(f"{len(remaining)} tables still hold rows for it")
            for table, count in remaining:
                print(f"    {count:>8}  {table}")
        if left_off:
            # The one that must never be shrugged off: the ledger is open.
            problems.append(f"these triggers are still switched off: {left_off}")

        if problems:
            print("\n  " + "\n  ".join(problems))
            return 1

        print("  No rows anywhere still reference it.")
        print(f"  All {len(triggers)} triggers are on.")
        print("\nUploaded invoices, receipts and statements are not touched — they")
        print(f"live outside the database under the prefix {entity_id}/ and can be")
        print("removed from storage separately, or left; nothing points at them now.")
        return 0
    finally:
        session.close()


if __name__ == "__main__":  # pragma: no cover - entrypoint
    raise SystemExit(main(sys.argv[1:]))
