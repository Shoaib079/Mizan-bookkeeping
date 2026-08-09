"""One request for a page of rows, not one request per row.

A partner or supplier page lists fifty movements, each needing to know whether
it may be edited or voided. Deciding that in the browser is how the app came
to have two opinions that agreed only by coincidence; asking fifty times is
not an option; and putting the rule into each list endpoint would spread it
back across the six places this work spent its time collapsing.

So: one route, the same answer as the single-entry route, and no key required
— it reads nothing, and a cached first answer would be actively wrong, because
the second ask is usually straight after a void when the answer is meant to
have changed.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import settings
from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_PAYABLE_CODE,
    GENERAL_EXPENSE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntrySource
from app.core.ledger.posting import PostingLine, prepare_journal_entry
from app.db.session import entity_context

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def two_entries(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    ids = []
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        for source in (JournalEntrySource.MANUAL, JournalEntrySource.OPENING_BALANCE):
            entry = prepare_journal_entry(
                db_session,
                restaurant_a.id,
                date(2026, 7, 15),
                "Batch fixture",
                [
                    PostingLine(
                        account_id=accounts[GENERAL_EXPENSE_CODE],
                        amount_kurus=5_000,
                        side=AccountNormalBalance.DEBIT,
                    ),
                    PostingLine(
                        account_id=accounts[ACCOUNTS_PAYABLE_CODE],
                        amount_kurus=5_000,
                        side=AccountNormalBalance.CREDIT,
                    ),
                ],
                actor_id=ACTOR_ID,
                source=source,
            )
            db_session.flush()
            ids.append(str(entry.id))
        db_session.commit()
    return {"entity_id": restaurant_a.id, "manual": ids[0], "opening": ids[1]}


def _post(client: TestClient, entity_id, entry_ids, **kwargs):
    return client.post(
        f"/entities/{entity_id}/ledger/entries/actions",
        json={"entry_ids": entry_ids},
        **kwargs,
    )


def test_it_answers_for_every_entry_asked_about(client, two_entries):
    ctx = two_entries
    res = _post(client, ctx["entity_id"], [ctx["manual"], ctx["opening"]])

    assert res.status_code == 200
    actions = res.json()["actions"]
    assert set(actions) == {ctx["manual"], ctx["opening"]}


def test_the_answers_differ_per_entry(client, two_entries):
    """Guard the guard: a route returning the same verdict for everything
    would satisfy the test above while telling every page the same lie."""
    ctx = two_entries
    actions = _post(client, ctx["entity_id"], [ctx["manual"], ctx["opening"]]).json()[
        "actions"
    ]

    assert actions[ctx["manual"]]["can_void"] is True
    assert actions[ctx["opening"]]["can_void"] is False


def test_it_matches_the_single_entry_route(client, two_entries):
    """Two routes, one answer. If they drift, a page and the General ledger
    disagree about the same row — which is the bug this whole phase is about."""
    ctx = two_entries
    batch = _post(client, ctx["entity_id"], [ctx["manual"]]).json()["actions"][
        ctx["manual"]
    ]
    single = client.get(
        f"/entities/{ctx['entity_id']}/ledger/entries/{ctx['manual']}/actions"
    ).json()

    assert batch == single


def test_an_entry_that_is_gone_is_absent_rather_than_fatal(client, two_entries):
    """A page asks about the rows it is showing. If one has been voided and
    swept since, the honest answer is nothing for that row — not an error that
    hides the other forty-nine."""
    ctx = two_entries
    res = _post(client, ctx["entity_id"], [ctx["manual"], str(uuid.uuid4())])

    assert res.status_code == 200
    assert set(res.json()["actions"]) == {ctx["manual"]}


def test_an_empty_ask_is_an_empty_answer(client, two_entries):
    res = _post(client, two_entries["entity_id"], [])
    assert res.status_code == 200
    assert res.json()["actions"] == {}


def test_it_needs_no_idempotency_key(client, two_entries, monkeypatch):
    """It is a POST because the ids go in the body, not because it changes
    anything. Enforced production settings must not stop a page drawing its
    buttons."""
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    ctx = two_entries

    res = _post(client, ctx["entity_id"], [ctx["manual"]])

    assert res.status_code == 200, (
        "the batch route is missing from SKIP_PATH_SUFFIXES — in production "
        "every page would fail to draw its Edit and Void buttons"
    )


def test_a_huge_ask_is_capped_rather_than_served(client, two_entries):
    """Each id costs a subledger lookup, so the whole ledger in one request is
    not a question anyone should be able to make the server answer."""
    from app.features.ledger.schema import MAX_ACTIONS_BATCH

    ctx = two_entries
    ids = [str(uuid.uuid4()) for _ in range(MAX_ACTIONS_BATCH + 50)]
    ids[0] = ctx["manual"]

    res = _post(client, ctx["entity_id"], ids)

    assert res.status_code == 200
    assert len(res.json()["actions"]) <= MAX_ACTIONS_BATCH
