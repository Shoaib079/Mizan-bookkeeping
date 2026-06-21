"""Own-account transfer GL posting — asset-to-asset only (Decisions §12)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount
from app.features.banking.transfer_models import AccountTransfer
from app.features.entities import service as entity_service


class InvalidTransferError(ValueError):
    """Transfer preconditions failed."""


@dataclass(frozen=True, slots=True)
class AccountTransferPostResult:
    journal_entry: JournalEntry
    account_transfer: AccountTransfer


def build_transfer_posting_lines(
    *,
    from_gl_account_id: uuid.UUID,
    to_gl_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit destination asset, credit source asset."""
    if amount_kurus <= 0:
        raise ValueError("transfer amount must be positive kuruş")

    return [
        PostingLine(
            account_id=to_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=from_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def _validate_asset_gl_account(
    session: Session, entity_id: uuid.UUID, account_id: uuid.UUID
) -> Account:
    account = session.get(Account, account_id)
    if account is None or account.entity_id != entity_id:
        raise InvalidAccountError("GL account not found for this entity")
    if not account.is_active:
        raise InvalidAccountError(f"account {account.code} is not active")
    if account.account_type != AccountType.ASSET:
        raise InvalidAccountError(
            f"account {account.code} is not an asset (bank/cash) account"
        )
    return account


def _validate_money_account(
    session: Session, entity_id: uuid.UUID, money_account_id: uuid.UUID
) -> MoneyAccount:
    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None or money_account.entity_id != entity_id:
        raise InvalidTransferError("Money account not found for this entity")
    if not money_account.is_active:
        raise InvalidTransferError("Money account is not active")
    return money_account


def persist_account_transfer(
    session: Session,
    *,
    from_money_account_id: uuid.UUID,
    to_money_account_id: uuid.UUID,
    transfer_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    from_statement_line_id: uuid.UUID | None = None,
    to_statement_line_id: uuid.UUID | None = None,
) -> AccountTransfer:
    """Persist transfer row without commit — caller must hold entity_context."""
    if amount_kurus <= 0:
        raise ValueError("transfer amount_kurus must be positive")

    transfer = AccountTransfer(
        from_money_account_id=from_money_account_id,
        to_money_account_id=to_money_account_id,
        transfer_date=transfer_date,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
        journal_entry_id=journal_entry_id,
        from_statement_line_id=from_statement_line_id,
        to_statement_line_id=to_statement_line_id,
    )
    session.add(transfer)
    session.flush()
    session.refresh(transfer)
    return transfer


def post_account_transfer(
    session: Session,
    entity_id: uuid.UUID,
    *,
    from_money_account_id: uuid.UUID,
    to_money_account_id: uuid.UUID,
    transfer_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    from_statement_line_id: uuid.UUID | None = None,
    to_statement_line_id: uuid.UUID | None = None,
) -> AccountTransferPostResult:
    """Post own-account transfer to GL and persist AccountTransfer in one transaction."""
    if amount_kurus <= 0:
        raise ValueError("Transfer amount_kurus must be positive")

    if from_money_account_id == to_money_account_id:
        raise InvalidTransferError("Source and destination money accounts must differ")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        from_account = _validate_money_account(session, entity_id, from_money_account_id)
        to_account = _validate_money_account(session, entity_id, to_money_account_id)

        _validate_asset_gl_account(session, entity_id, from_account.gl_account_id)
        _validate_asset_gl_account(session, entity_id, to_account.gl_account_id)

        lines = build_transfer_posting_lines(
            from_gl_account_id=from_account.gl_account_id,
            to_gl_account_id=to_account.gl_account_id,
            amount_kurus=amount_kurus,
        )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            transfer_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.TRANSFER,
        )

        transfer = persist_account_transfer(
            session,
            from_money_account_id=from_money_account_id,
            to_money_account_id=to_money_account_id,
            transfer_date=transfer_date,
            amount_kurus=amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
            from_statement_line_id=from_statement_line_id,
            to_statement_line_id=to_statement_line_id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(transfer)
        _ = list(journal_entry.lines)

        return AccountTransferPostResult(
            journal_entry=journal_entry,
            account_transfer=transfer,
        )
