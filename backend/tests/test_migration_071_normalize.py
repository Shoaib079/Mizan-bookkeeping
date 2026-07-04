"""Migration 071 — normalize journal line side without immutability trigger failure."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.config import settings
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntryLine, JournalEntrySource
from app.core.ledger.posting import PostingLine, post_journal_entry
from app.db.session import entity_context


@pytest.fixture
def admin_connection():
    """Table owner connection — required for DISABLE/ENABLE TRIGGER (same as Alembic)."""
    admin_engine = create_engine(settings.test_database_admin_url, pool_pre_ping=True)
    conn = admin_engine.connect()
    yield conn
    conn.close()
    admin_engine.dispose()


def _normalize_journal_line_sides(conn: Connection) -> None:
    """Same steps as alembic 071 upgrade (journal_entry_lines portion)."""
    conn.execute(
        text(
            "ALTER TABLE journal_entry_lines DISABLE TRIGGER journal_entry_lines_immutable"
        )
    )
    conn.execute(
        text(
            """
            UPDATE journal_entry_lines
            SET side = UPPER(side)
            WHERE side <> UPPER(side)
            """
        )
    )
    conn.execute(
        text(
            "ALTER TABLE journal_entry_lines ENABLE TRIGGER journal_entry_lines_immutable"
        )
    )


def _count_mixed_case_sides(conn: Connection) -> int:
    return conn.execute(
        text(
            """
            SELECT COUNT(*) FROM journal_entry_lines
            WHERE side <> UPPER(side)
            """
        )
    ).scalar_one()


def _trigger_enabled(conn: Connection) -> bool:
    return (
        conn.execute(
            text(
                """
                SELECT COUNT(*) FROM pg_trigger
                WHERE tgname = 'journal_entry_lines_immutable'
                  AND tgenabled <> 'D'
                """
            )
        ).scalar_one()
        == 1
    )


def _post_sample_entry(db_session: Session, entity_id, actor_id):
    seed_default_chart(db_session, entity_id)
    with entity_context(db_session, entity_id):
        accounts = {
            account.code: account.id
            for account in db_session.scalars(select(Account)).all()
        }
    return post_journal_entry(
        db_session,
        entity_id,
        date(2026, 1, 1),
        "Migration 071 side test",
        [
            PostingLine(accounts["1100"], 100_00, AccountNormalBalance.DEBIT),
            PostingLine(accounts["2000"], 100_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )


def test_orm_posted_lines_store_uppercase_side_names(
    db_session, restaurant_a, admin_connection
) -> None:
    actor_id = uuid.uuid4()
    entry = _post_sample_entry(db_session, restaurant_a.id, actor_id)
    entry_id = entry.id
    sides = {line.side for line in entry.lines}
    db_session.commit()
    assert sides == {AccountNormalBalance.DEBIT, AccountNormalBalance.CREDIT}

    raw_sides = admin_connection.execute(
        text(
            """
            SELECT DISTINCT side FROM journal_entry_lines
            WHERE journal_entry_id = :je_id
            """
        ),
        {"je_id": entry_id},
    ).fetchall()
    assert {row[0] for row in raw_sides} == {"DEBIT", "CREDIT"}
    assert _count_mixed_case_sides(admin_connection) == 0


def test_071_normalize_is_noop_when_sides_already_uppercase(
    db_session, restaurant_a, admin_connection
) -> None:
    actor_id = uuid.uuid4()
    _post_sample_entry(db_session, restaurant_a.id, actor_id)
    db_session.commit()
    assert _count_mixed_case_sides(admin_connection) == 0

    _normalize_journal_line_sides(admin_connection)
    admin_connection.commit()

    assert _count_mixed_case_sides(admin_connection) == 0
    assert _trigger_enabled(admin_connection)


def test_lowercase_side_update_blocked_without_trigger_disable(
    db_session, restaurant_a, admin_connection
) -> None:
    actor_id = uuid.uuid4()
    entry = _post_sample_entry(db_session, restaurant_a.id, actor_id)
    line_id = entry.lines[0].id
    db_session.commit()

    admin_connection.execute(
        text("ALTER TABLE journal_entry_lines DISABLE TRIGGER journal_entry_lines_immutable")
    )
    admin_connection.execute(
        text("UPDATE journal_entry_lines SET side = 'debit' WHERE id = :id"),
        {"id": line_id},
    )
    admin_connection.execute(
        text("ALTER TABLE journal_entry_lines ENABLE TRIGGER journal_entry_lines_immutable")
    )
    admin_connection.commit()

    assert _count_mixed_case_sides(admin_connection) == 1

    with entity_context(db_session, restaurant_a.id):
        with pytest.raises(DBAPIError, match="lines are immutable"):
            db_session.execute(
                text(
                    """
                    UPDATE journal_entry_lines
                    SET side = UPPER(side)
                    WHERE id = :id
                    """
                ),
                {"id": line_id},
            )
            db_session.commit()
    db_session.rollback()


def test_071_normalize_fixes_lowercase_side_and_restores_trigger(
    db_session, restaurant_a, admin_connection
) -> None:
    actor_id = uuid.uuid4()
    entry = _post_sample_entry(db_session, restaurant_a.id, actor_id)
    line_id = entry.lines[0].id
    db_session.commit()

    admin_connection.execute(
        text("ALTER TABLE journal_entry_lines DISABLE TRIGGER journal_entry_lines_immutable")
    )
    admin_connection.execute(
        text("UPDATE journal_entry_lines SET side = 'credit' WHERE id = :id"),
        {"id": line_id},
    )
    admin_connection.execute(
        text("ALTER TABLE journal_entry_lines ENABLE TRIGGER journal_entry_lines_immutable")
    )
    admin_connection.commit()

    assert _count_mixed_case_sides(admin_connection) == 1

    _normalize_journal_line_sides(admin_connection)
    admin_connection.commit()

    assert _count_mixed_case_sides(admin_connection) == 0
    side = admin_connection.execute(
        text("SELECT side FROM journal_entry_lines WHERE id = :id"),
        {"id": line_id},
    ).scalar_one()
    assert side == "CREDIT"

    with entity_context(db_session, restaurant_a.id):
        orm_line = db_session.get(JournalEntryLine, line_id)
        assert orm_line is not None
        assert orm_line.side == AccountNormalBalance.CREDIT

    with entity_context(db_session, restaurant_a.id):
        with pytest.raises(DBAPIError, match="lines are immutable"):
            db_session.execute(
                text("UPDATE journal_entry_lines SET side = 'debit' WHERE id = :id"),
                {"id": line_id},
            )
            db_session.commit()
    db_session.rollback()

    assert _trigger_enabled(admin_connection)
