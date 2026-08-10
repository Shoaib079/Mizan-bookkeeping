"""Deleting a restaurant takes all of it, and only it, and leaves the ledger shut.

The script in `scripts/delete_entity.py` disables the triggers that make the
ledger undeletable. That is the most dangerous thing in this codebase, so the
two ways it could go wrong quietly are both pinned here:

  - it reaches past the restaurant it was given, or
  - it leaves the triggers off afterwards, so that from then on *anything*
    can delete a journal entry and nothing complains.

The second is the frightening one. It leaves no trace at the time; the damage
arrives weeks later, from unrelated code, in books that were supposed to be
impossible to alter.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_PAYABLE_CODE,
    GENERAL_EXPENSE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import PostingLine, prepare_journal_entry
from app.db.session import entity_context
from app.features.auth.models import AuthAuditEvent
from scripts import delete_entity

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _post(db_session, entity_id, *, amount: int = 10_000) -> uuid.UUID:
    with entity_context(db_session, entity_id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        entry = prepare_journal_entry(
            db_session,
            entity_id,
            date(2026, 3, 1),
            "Delete fixture",
            [
                PostingLine(
                    account_id=accounts[GENERAL_EXPENSE_CODE],
                    amount_kurus=amount,
                    side=AccountNormalBalance.DEBIT,
                ),
                PostingLine(
                    account_id=accounts[ACCOUNTS_PAYABLE_CODE],
                    amount_kurus=amount,
                    side=AccountNormalBalance.CREDIT,
                ),
            ],
            actor_id=ACTOR_ID,
            source=JournalEntrySource.MANUAL,
        )
        db_session.commit()
        return entry.id


@dataclass(frozen=True)
class Restaurant:
    """Id and name as plain values, deliberately not an ORM instance.

    Handing back a live `Entity` makes the tests fragile in a way that has
    nothing to do with what they are testing: once the row is deleted on
    another connection, `session.get()` raises `ObjectDeletedError` instead of
    returning `None`, and so does reading `.id` off the stale instance.
    """

    id: uuid.UUID
    name: str


@pytest.fixture
def two_restaurants(db_session, restaurant_a, restaurant_b) -> tuple[Restaurant, Restaurant]:
    """Both with real books, so "only it" means something."""
    for entity in (restaurant_a, restaurant_b):
        seed_default_chart(db_session, entity.id)
        _post(db_session, entity.id)
    return (
        Restaurant(restaurant_a.id, restaurant_a.name),
        Restaurant(restaurant_b.id, restaurant_b.name),
    )


def _exists(session, entity_id: uuid.UUID) -> bool:
    """Is the row there? Asked in SQL, around the ORM's identity map."""
    return (
        session.execute(
            text("SELECT count(*) FROM entities WHERE id = :e"), {"e": str(entity_id)}
        ).scalar_one()
        > 0
    )


@pytest.fixture
def owner_session(db_session):
    """A session as the table owner, which is what the script really uses.

    Not `db_session`: that connects as `mizan_app`, which holds DML rights and
    nothing else, and `ALTER TABLE … DISABLE TRIGGER` needs ownership. Driving
    the script through the app role would have tested a thing that cannot
    happen, and passed while production failed.

    Depends on `db_session` so pytest tears this down first — the truncate in
    that fixture's teardown blocks on any connection still holding rows.
    """
    engine = create_engine(settings.test_database_admin_url, pool_pre_ping=True)
    session = sessionmaker(bind=engine)()
    yield session
    session.rollback()
    session.close()
    engine.dispose()


@pytest.fixture
def run(owner_session, db_session, monkeypatch):
    """Drive `main`, with backups satisfied.

    The backup gate is real and is checked on its own below; stubbing it here
    keeps every other test from needing storage set up.
    """
    monkeypatch.setattr(delete_entity, "_open_session", lambda: owner_session)
    monkeypatch.setattr(delete_entity, "_backup_today", lambda: True)
    monkeypatch.setattr(owner_session, "close", lambda: None)

    def _run(*argv: str) -> int:
        code = delete_entity.main(list(argv))
        # The script commits on its own connection; this one is holding a
        # snapshot and an identity map from before that.
        db_session.rollback()
        db_session.expire_all()
        return code

    return _run


def _trigger_names(session) -> set[str]:
    return {t for _, t in delete_entity._delete_blocking_triggers(session)}


def _count(session, table: str, entity_id) -> int:
    """Count rows the way the script has to — with RLS satisfied."""
    session.execute(
        text("SELECT set_config('app.current_entity_id', :e, true)"),
        {"e": str(entity_id)},
    )
    return session.execute(
        text(f"SELECT count(*) FROM {table} WHERE entity_id = :e"),  # noqa: S608
        {"e": str(entity_id)},
    ).scalar_one()


class TestItRefuses:
    """Every gate, because the ones that never fire are the ones that rot."""

    def test_without_confirm_nothing_is_touched(self, db_session, two_restaurants, run):
        a, _ = two_restaurants
        assert run("Restaurant A") == 0
        assert _exists(db_session, a.id)

    def test_a_confirm_that_does_not_match_is_not_enough(
        self, db_session, two_restaurants, run
    ):
        a, _ = two_restaurants
        assert run("Restaurant A", "--confirm", "restaurant a") == 0
        assert _exists(db_session, a.id)

    def test_an_ambiguous_name_resolves_to_nothing(self, two_restaurants, run):
        # Both fixtures are "Restaurant …". Picking one would be a coin toss
        # with no undo.
        assert run("Restaurant") == 2

    def test_an_unknown_name_resolves_to_nothing(self, run, two_restaurants):
        assert run("Nowhere") == 2

    def test_the_last_restaurant_cannot_be_deleted(
        self, db_session, restaurant_a, run
    ):
        seed_default_chart(db_session, restaurant_a.id)
        assert run("Restaurant A", "--confirm", "Restaurant A") == 1
        assert _exists(db_session, restaurant_a.id)

    def test_no_backup_today_stops_it(self, db_session, two_restaurants, monkeypatch, run):
        a, _ = two_restaurants
        monkeypatch.setattr(delete_entity, "_backup_today", lambda: False)
        assert run("Restaurant A", "--confirm", "Restaurant A") == 1
        assert _exists(db_session, a.id)

    def test_the_backup_gate_can_be_overridden_deliberately(
        self, db_session, two_restaurants, monkeypatch, run
    ):
        a, _ = two_restaurants
        monkeypatch.setattr(delete_entity, "_backup_today", lambda: False)
        assert run("Restaurant A", "--confirm", "Restaurant A", "--i-have-no-backup") == 0
        assert not _exists(db_session, a.id)

    def test_a_connection_to_the_wrong_database_stops_it(
        self, db_session, two_restaurants, monkeypatch, run
    ):
        # Two URLs that can disagree. The dangerous disagreement is silent:
        # DATABASE_URL set to production, DATABASE_ADMIN_URL left on its
        # localhost default.
        a, _ = two_restaurants
        monkeypatch.setattr(
            delete_entity, "_wrong_database", lambda _s: "pointed somewhere else"
        )
        assert run("Restaurant A", "--confirm", "Restaurant A") == 1
        assert _exists(db_session, a.id)

    def test_the_check_passes_when_the_database_is_right(self, owner_session):
        # Otherwise the guard above could refuse everything and still pass.
        assert delete_entity._wrong_database(owner_session) is None

    def test_a_missing_delete_function_stops_it(
        self, db_session, two_restaurants, monkeypatch, run
    ):
        # The script is the guards; the delete lives in the database. If the
        # migration has not run, say so before the confirmation, not after.
        a, _ = two_restaurants
        monkeypatch.setattr(delete_entity, "_has_delete_function", lambda _s: False)
        assert run("Restaurant A", "--confirm", "Restaurant A") == 1
        assert _exists(db_session, a.id)

    def test_the_delete_function_is_actually_installed(self, owner_session):
        # Otherwise the guard above could refuse everything and still pass.
        assert delete_entity._has_delete_function(owner_session)

    def test_finding_no_triggers_stops_it(
        self, db_session, two_restaurants, monkeypatch, run
    ):
        # If the pg_trigger query ever stops matching, the honest reading is
        # "I can no longer tell", not "the ledger became deletable".
        a, _ = two_restaurants
        monkeypatch.setattr(delete_entity, "_delete_blocking_triggers", lambda _s: [])
        assert run("Restaurant A", "--confirm", "Restaurant A") == 1
        assert _exists(db_session, a.id)


class TestItCountsWhatItWillDestroy:
    """The inventory is the whole basis for confirming. It has to be true.

    It was not. Every one of these tables carries FORCE ROW LEVEL SECURITY, so
    counting without `app.current_entity_id` set returned zero across the board
    — and the script would have reported "no data" and then deleted a full set
    of books anyway, because cascades are exempt from RLS even though queries
    are not.
    """

    def test_it_sees_the_ledger_it_is_about_to_delete(
        self, owner_session, two_restaurants
    ):
        a, _ = two_restaurants
        inventory = dict(delete_entity._inventory(owner_session, a.id))
        assert inventory.get("journal_entries", 0) > 0
        assert inventory.get("journal_entry_lines", 0) > 0

    def test_it_agrees_with_a_plain_count(self, owner_session, two_restaurants):
        a, _ = two_restaurants
        inventory = dict(delete_entity._inventory(owner_session, a.id))
        assert inventory["journal_entry_lines"] == _count(
            owner_session, "journal_entry_lines", a.id
        )

    def test_it_counts_only_the_one_restaurant(self, owner_session, two_restaurants):
        a, b = two_restaurants
        for_a = dict(delete_entity._inventory(owner_session, a.id))
        for_b = dict(delete_entity._inventory(owner_session, b.id))
        assert for_a["journal_entries"] == for_b["journal_entries"]
        assert for_a["journal_entries"] < _count(
            owner_session, "journal_entries", a.id
        ) + _count(owner_session, "journal_entries", b.id)


class TestItDeletes:
    def test_the_restaurant_and_its_ledger_go(
        self, db_session, owner_session, two_restaurants, run
    ):
        a, _ = two_restaurants
        assert run("Restaurant A", "--confirm", "Restaurant A") == 0

        assert not _exists(db_session, a.id)
        assert _count(owner_session, "journal_entries", a.id) == 0

    def test_it_reaches_nothing_else(
        self, db_session, owner_session, two_restaurants, run
    ):
        a, b = two_restaurants
        before = _count(owner_session, "journal_entry_lines", b.id)
        assert before > 0, "the fixture posted nothing — the test proves nothing"

        assert run("Restaurant A", "--confirm", "Restaurant A") == 0

        assert _exists(db_session, b.id)
        assert _count(owner_session, "journal_entry_lines", b.id) == before

    def test_no_table_anywhere_still_holds_its_rows(
        self, owner_session, two_restaurants, run
    ):
        # The cascade is the whole mechanism, and it is invisible: nothing in
        # the script names the tables it empties.
        a, _ = two_restaurants
        assert delete_entity._inventory(owner_session, a.id) != []
        assert run("Restaurant A", "--confirm", "Restaurant A") == 0
        assert delete_entity._inventory(owner_session, a.id) == []

    def test_it_accepts_an_id_as_well_as_a_name(self, db_session, two_restaurants, run):
        a, _ = two_restaurants
        assert run(str(a.id), "--confirm", "Restaurant A") == 0
        assert not _exists(db_session, a.id)


class TestTheAuditTrailOutlivesIt:
    """`auth_audit_events` is the one table that is not carried away.

    Its `entity_id` is `ON DELETE SET NULL`, so the login history survives a
    deleted restaurant. But the table is append-only — its trigger fires
    `BEFORE UPDATE OR DELETE` — and a SET NULL cascade *is* an update. Without
    that trigger stood down, deleting a restaurant that anyone had ever logged
    into would abort.

    Nothing in the earlier tests logged in, so the whole path was untested. It
    only works because the trigger discovery matches on the DELETE bit, which
    a trigger declared `UPDATE OR DELETE` also carries.
    """

    @pytest.fixture
    def with_login_history(self, db_session, two_restaurants):
        a, b = two_restaurants
        for entity, action in ((a, "login"), (b, "login"), (a, "member_invited")):
            db_session.add(
                AuthAuditEvent(
                    action=action, entity_id=entity.id, email="owner@example.com"
                )
            )
        db_session.commit()
        return two_restaurants

    def test_deleting_a_restaurant_someone_logged_into_works(
        self, db_session, with_login_history, run
    ):
        a, _ = with_login_history
        assert run("Restaurant A", "--confirm", "Restaurant A") == 0
        assert not _exists(db_session, a.id)

    def test_its_audit_rows_survive_with_no_restaurant(
        self, db_session, owner_session, with_login_history, run
    ):
        a, _ = with_login_history
        before = owner_session.execute(
            text("SELECT count(*) FROM auth_audit_events")
        ).scalar_one()

        assert run("Restaurant A", "--confirm", "Restaurant A") == 0

        after = owner_session.execute(
            text("SELECT count(*) FROM auth_audit_events")
        ).scalar_one()
        assert after == before, "audit rows were deleted, not detached"

        orphaned = owner_session.execute(
            text("SELECT count(*) FROM auth_audit_events WHERE entity_id IS NULL")
        ).scalar_one()
        assert orphaned == 2, "the two rows for the deleted restaurant should be loose"

    def test_the_other_restaurants_history_still_points_at_it(
        self, owner_session, with_login_history, run
    ):
        _, b = with_login_history
        assert run("Restaurant A", "--confirm", "Restaurant A") == 0
        assert (
            owner_session.execute(
                text("SELECT count(*) FROM auth_audit_events WHERE entity_id = :e"),
                {"e": str(b.id)},
            ).scalar_one()
            == 1
        )

    def test_the_table_is_still_append_only_afterwards(
        self, owner_session, with_login_history, run
    ):
        assert run("Restaurant A", "--confirm", "Restaurant A") == 0
        with pytest.raises(Exception, match="(?i)append-only"):
            owner_session.execute(text("DELETE FROM auth_audit_events"))
        owner_session.rollback()


class TestTheLedgerCloses:
    """The part that would be silent."""

    def test_every_trigger_is_switched_back_on(self, owner_session, two_restaurants, run):
        before = _trigger_names(owner_session)
        assert "journal_entries_no_delete" in before
        assert delete_entity._disabled_triggers(owner_session) == []

        assert run("Restaurant A", "--confirm", "Restaurant A") == 0

        assert _trigger_names(owner_session) == before
        # Presence is not enough — a disabled trigger is still in pg_trigger,
        # so the name check above passes over a wide-open ledger.
        assert delete_entity._disabled_triggers(owner_session) == []

    def test_the_disabled_check_can_actually_see_a_disabled_trigger(
        self, owner_session, two_restaurants
    ):
        """Guard the guard — otherwise it returns [] for the wrong reason."""
        owner_session.execute(
            text("ALTER TABLE journal_entries DISABLE TRIGGER journal_entries_no_delete")
        )
        assert "journal_entries.journal_entries_no_delete" in (
            delete_entity._disabled_triggers(owner_session)
        )
        owner_session.rollback()
        assert delete_entity._disabled_triggers(owner_session) == []

    def test_the_surviving_ledger_is_undeletable_again(
        self, db_session, two_restaurants, run
    ):
        # Names matching is not the same as the trigger working. This deletes
        # from the *other* restaurant's ledger and expects to be stopped.
        _, b = two_restaurants
        assert run("Restaurant A", "--confirm", "Restaurant A") == 0

        with entity_context(db_session, b.id):
            entry = db_session.scalars(select(JournalEntry)).first()
            assert entry is not None
            with pytest.raises(Exception, match="(?i)immutable|delete|not allowed"):
                db_session.execute(
                    text("DELETE FROM journal_entries WHERE id = :i"), {"i": str(entry.id)}
                )
        db_session.rollback()

    def test_the_function_switches_them_on_before_it_returns(
        self, owner_session, two_restaurants
    ):
        """The open window must not outlive the call, let alone the transaction.

        Checked *before* committing. If the function left the re-enabling to
        its caller, this is where that shows: the triggers would still be off
        at this point, and every other test would still pass because they all
        look after the commit.
        """
        a, _ = two_restaurants
        owner_session.execute(
            text(f"SELECT {delete_entity.DELETE_ENTITY_FUNCTION}(:e)"), {"e": str(a.id)}
        )
        assert delete_entity._disabled_triggers(owner_session) == []
        owner_session.rollback()

    def test_a_rollback_takes_the_whole_delete_with_it(
        self, owner_session, two_restaurants
    ):
        """Postgres makes the disabling transactional; this proves it.

        It is what makes a crash part-way through safe rather than
        catastrophic — there is no committed state in which the restaurant is
        half-deleted or the ledger is left unguarded.
        """
        a, _ = two_restaurants
        before = _trigger_names(owner_session)

        owner_session.execute(
            text(f"SELECT {delete_entity.DELETE_ENTITY_FUNCTION}(:e)"), {"e": str(a.id)}
        )
        assert not _exists(owner_session, a.id)

        owner_session.rollback()

        assert _exists(owner_session, a.id), "the delete survived a rollback"
        assert _trigger_names(owner_session) == before
        assert delete_entity._disabled_triggers(owner_session) == []
        assert _count(owner_session, "journal_entries", a.id) > 0
