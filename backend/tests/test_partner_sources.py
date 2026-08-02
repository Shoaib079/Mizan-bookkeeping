"""Partner reports remap RULE_AUTO journals to their economic type."""

from __future__ import annotations

import uuid
from datetime import date

import pytest

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.ledger.models import JournalEntrySource
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineClassification,
    StatementLineClassificationSource,
    StatementLineStatus,
)
from app.features.reports.cash_flow import get_cash_flow
from app.features.reports.partner_sources import (
    economic_source_value,
    load_rule_auto_economic_sources,
)

def _import_outflow(
    db_session,
    entity_id: uuid.UUID,
    bank_id: uuid.UUID,
    *,
    tx_date: str,
    amount_lira: str,
    description: str,
    reference: str,
):
    csv = (
        "transaction_date,amount,description,reference\n"
        f'{tx_date},"{amount_lira}",{description},{reference}\n'
    ).encode()
    return statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank_id,
        csv,
        original_filename=f"{reference}.csv",
    )


@pytest.fixture
def bank_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Partner Source Bank",
            bank_name="Test",
        ),
    )
    return {"entity_id": restaurant_a.id, "bank": bank}


def test_rule_auto_bank_fee_rolls_into_bank_fee_cash_flow(
    db_session, bank_setup
) -> None:
    entity_id = bank_setup["entity_id"]
    bank_id = bank_setup["bank"].id

    statement = _import_outflow(
        db_session,
        entity_id,
        bank_id,
        tx_date="2026-04-01",
        amount_lira="-12,50",
        description="HESAP İŞLETİM ÜCRETİ 12,50",
        reference="FEE-PARTNER",
    )

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, statement.lines[0].id)
        assert line is not None
        assert line.status == StatementLineStatus.POSTED
        assert line.classification == StatementLineClassification.BANK_FEE
        assert (
            line.classification_source
            == StatementLineClassificationSource.RULE_AUTO.value
        )
        assert line.journal_entry_id is not None
        resolved = load_rule_auto_economic_sources(
            db_session, [line.journal_entry_id]
        )
        assert resolved[line.journal_entry_id] == JournalEntrySource.BANK_FEE.value
        assert (
            economic_source_value(
                JournalEntrySource.RULE_AUTO,
                line.journal_entry_id,
                resolved,
            )
            == JournalEntrySource.BANK_FEE.value
        )

    report = get_cash_flow(
        db_session, entity_id, date(2026, 4, 1), date(2026, 4, 30)
    )
    by_source = {row.source: row for row in report.by_source}
    assert "rule_auto" not in by_source
    assert by_source["bank_fee"].net_cash_kurus == -1_250
