"""PostgreSQL ledger immutability triggers — raw SQL bypass tests."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource, LedgerAuditAction, LedgerAuditEvent
from app.core.ledger.posting import PostingLine, post_journal_entry, void_journal_entry
from app.db.session import entity_context


@pytest.fixture
def actor_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        from app.core.chart_of_accounts.models import Account

        accounts = list(db_session.scalars(select(Account)))
    return {account.code: account.id for account in accounts}


def _post_sample_entry(db_session, restaurant_a, seeded_accounts, actor_id) -> JournalEntry:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    return post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "DB immutability sample",
        [
            PostingLine(bank_id, 100_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 100_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )


def test_raw_sql_update_journal_entry_description_rejected(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    entry = _post_sample_entry(db_session, restaurant_a, seeded_accounts, actor_id)
    with entity_context(db_session, restaurant_a.id):
        with pytest.raises(DBAPIError, match="immutable except void metadata"):
            db_session.execute(
                text("UPDATE journal_entries SET description = :desc WHERE id = :id"),
                {"desc": "Tampered", "id": entry.id},
            )
            db_session.commit()
    db_session.rollback()


def test_raw_sql_delete_journal_entry_rejected(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    entry = _post_sample_entry(db_session, restaurant_a, seeded_accounts, actor_id)
    with entity_context(db_session, restaurant_a.id):
        with pytest.raises(DBAPIError, match="cannot be deleted"):
            db_session.execute(
                text("DELETE FROM journal_entries WHERE id = :id"),
                {"id": entry.id},
            )
            db_session.commit()
    db_session.rollback()


def test_raw_sql_update_journal_line_amount_rejected(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    entry = _post_sample_entry(db_session, restaurant_a, seeded_accounts, actor_id)
    line_id = entry.lines[0].id
    with entity_context(db_session, restaurant_a.id):
        with pytest.raises(DBAPIError, match="lines are immutable"):
            db_session.execute(
                text("UPDATE journal_entry_lines SET amount_kurus = :amt WHERE id = :id"),
                {"amt": 999_99, "id": line_id},
            )
            db_session.commit()
    db_session.rollback()


def test_raw_sql_update_ledger_audit_event_rejected(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    entry = _post_sample_entry(db_session, restaurant_a, seeded_accounts, actor_id)
    with entity_context(db_session, restaurant_a.id):
        audit_id = db_session.scalar(
            select(LedgerAuditEvent.id).where(
                LedgerAuditEvent.journal_entry_id == entry.id
            )
        )
        assert audit_id is not None
        with pytest.raises(DBAPIError, match="append-only"):
            db_session.execute(
                text("UPDATE ledger_audit_events SET reason = :reason WHERE id = :id"),
                {"reason": "altered", "id": audit_id},
            )
            db_session.commit()
    db_session.rollback()


def test_raw_sql_delete_ledger_audit_event_rejected(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    entry = _post_sample_entry(db_session, restaurant_a, seeded_accounts, actor_id)
    with entity_context(db_session, restaurant_a.id):
        audit_id = db_session.scalar(
            select(LedgerAuditEvent.id).where(
                LedgerAuditEvent.journal_entry_id == entry.id
            )
        )
        assert audit_id is not None
        with pytest.raises(DBAPIError, match="append-only"):
            db_session.execute(
                text("DELETE FROM ledger_audit_events WHERE id = :id"),
                {"id": audit_id},
            )
            db_session.commit()
    db_session.rollback()


def test_void_metadata_update_without_gate_rejected_by_db(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    entry = _post_sample_entry(db_session, restaurant_a, seeded_accounts, actor_id)
    with entity_context(db_session, restaurant_a.id):
        with pytest.raises(DBAPIError, match="journal_void_update gate"):
            db_session.execute(
                text(
                    "UPDATE journal_entries SET status = 'VOIDED', voided_at = now() "
                    "WHERE id = :id"
                ),
                {"id": entry.id},
            )
            db_session.commit()
    db_session.rollback()


def test_void_metadata_update_with_gate_succeeds_via_raw_sql(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    entry = _post_sample_entry(db_session, restaurant_a, seeded_accounts, actor_id)
    with entity_context(db_session, restaurant_a.id):
        db_session.execute(text("SELECT set_config('app.journal_void_update', '1', true)"))
        db_session.execute(
            text(
                "UPDATE journal_entries SET status = 'VOIDED', voided_at = now() WHERE id = :id"
            ),
            {"id": entry.id},
        )
        db_session.commit()
        row = db_session.execute(
            text("SELECT status, voided_at FROM journal_entries WHERE id = :id"),
            {"id": entry.id},
        ).one()
        assert row.status == "VOIDED"
        assert row.voided_at is not None


def test_void_journal_entry_still_works_with_db_triggers(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    entry = _post_sample_entry(db_session, restaurant_a, seeded_accounts, actor_id)
    voided, reversal = void_journal_entry(
        db_session,
        restaurant_a.id,
        entry.id,
        actor_id=actor_id,
        reason="DB trigger path",
    )
    assert voided.status.value == "voided"
    assert voided.reversed_by_entry_id == reversal.id
    assert reversal.reverses_entry_id == entry.id

    with entity_context(db_session, restaurant_a.id):
        void_events = list(
            db_session.scalars(
                select(LedgerAuditEvent).where(
                    LedgerAuditEvent.journal_entry_id == entry.id,
                    LedgerAuditEvent.action == LedgerAuditAction.VOID,
                )
            )
        )
        assert len(void_events) == 1
        assert void_events[0].reason == "DB trigger path"
