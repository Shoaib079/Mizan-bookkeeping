"""Bank/cash/credit-card account tree service — GL sub-accounts + money_accounts (Decisions §12)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntryLine
from app.db.session import entity_context, require_entity_context
from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.features.banking.models import (
    BUCKET_CODE_BY_KIND,
    FX_BUCKET_CODE_BY_CURRENCY,
    MoneyAccount,
    MoneyAccountKind,
    SUPPORTED_FX_CURRENCIES,
)
from app.features.banking.schema import (
    ForeignCurrencyTree,
    MoneyAccountCreate,
    MoneyAccountRead,
    MoneyAccountTree,
    MoneyAccountTreeBranch,
    MoneyAccountTreeLeaf,
    MoneyAccountUpdate,
)
from app.features.entities import service as entity_service


class ChartNotSeededError(ValueError):
    """Entity chart must be seeded before creating money accounts."""


class DuplicateMoneyAccountError(Exception):
    """Raised when a money account name already exists for the entity."""


class InvalidMoneyAccountError(ValueError):
    """Money account payload failed validation."""


DEFAULT_CASH_DRAWER_NAME = "Main Drawer"


def ensure_default_cash_drawer(
    session: Session, entity_id: uuid.UUID, *, commit: bool = True
) -> MoneyAccountRead | None:
    """Create one TRY cash drawer after chart seed — skip if any cash account exists."""
    with entity_context(session, entity_id):
        existing_count = session.scalar(
            select(func.count())
            .select_from(MoneyAccount)
            .where(MoneyAccount.account_kind == MoneyAccountKind.CASH)
        ) or 0
    if existing_count > 0:
        return None
    return create_money_account(
        session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.CASH,
            name=DEFAULT_CASH_DRAWER_NAME,
        ),
        commit=commit,
    )


def gl_balance_kurus(
    session: Session, account_id: uuid.UUID, normal_balance: AccountNormalBalance
) -> int:
    """Signed GL balance for one account from posted journal lines."""
    rows = session.execute(
        select(JournalEntryLine.side, func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0))
        .where(JournalEntryLine.account_id == account_id)
        .group_by(JournalEntryLine.side)
    ).all()
    debits = credits = 0
    for side, total in rows:
        if side == AccountNormalBalance.DEBIT:
            debits = int(total)
        else:
            credits = int(total)
    if normal_balance == AccountNormalBalance.DEBIT:
        return debits - credits
    return credits - debits


def rollup_child_balances(balances: list[int]) -> int:
    """Parent bucket balance = sum of active child GL balances."""
    return sum(balances)


def _next_sub_account_code(session: Session, parent: Account) -> str:
    parent_num = int(parent.code)
    child_codes = session.scalars(
        select(Account.code).where(Account.parent_account_id == parent.id)
    ).all()
    if not child_codes:
        return str(parent_num + 1)
    return str(max(int(code) for code in child_codes) + 1)


def _get_bucket_account(session: Session, kind: MoneyAccountKind) -> Account:
    if kind == MoneyAccountKind.FOREIGN_CURRENCY:
        raise InvalidMoneyAccountError(
            "foreign currency accounts require an explicit currency bucket"
        )
    bucket_code = BUCKET_CODE_BY_KIND[kind]
    return _get_bucket_by_code(session, bucket_code)


def _get_bucket_by_code(session: Session, bucket_code: str) -> Account:
    bucket = session.scalar(select(Account).where(Account.code == bucket_code))
    if bucket is None:
        raise ChartNotSeededError(
            f"Chart not seeded — bucket account {bucket_code} not found. "
            "Seed the chart of accounts before creating money accounts."
        )
    return bucket


def _to_read(session: Session, money_account: MoneyAccount, gl_account: Account) -> MoneyAccountRead:
    balance = gl_balance_kurus(session, gl_account.id, gl_account.normal_balance)
    native_quantity: int | None = None
    if money_account.account_kind == MoneyAccountKind.FOREIGN_CURRENCY:
        from app.core.fx.ledger import native_quantity_balance

        native_quantity = native_quantity_balance(
            session, money_account.entity_id, money_account.id
        )

    return MoneyAccountRead(
        id=money_account.id,
        entity_id=money_account.entity_id,
        account_kind=money_account.account_kind,
        currency=money_account.currency,
        name=money_account.name,
        gl_account_id=gl_account.id,
        gl_account_code=gl_account.code,
        bank_name=money_account.bank_name,
        iban=money_account.iban,
        last_four=money_account.last_four,
        is_active=money_account.is_active,
        balance_kurus=balance,
        native_quantity=native_quantity,
        created_at=money_account.created_at,
        updated_at=money_account.updated_at,
    )


def create_money_account(
    session: Session,
    entity_id: uuid.UUID,
    payload: MoneyAccountCreate,
    *,
    commit: bool = True,
) -> MoneyAccountRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    currency: str | None = None
    if payload.account_kind == MoneyAccountKind.FOREIGN_CURRENCY:
        if payload.currency is None:
            raise InvalidMoneyAccountError("currency is required for foreign currency accounts")
        currency = payload.currency.upper()
        if currency not in SUPPORTED_FX_CURRENCIES:
            raise InvalidMoneyAccountError(
                f"unsupported FX currency {currency!r}; use one of {sorted(SUPPORTED_FX_CURRENCIES)}"
            )
    elif payload.currency is not None:
        raise InvalidMoneyAccountError("currency is only allowed for foreign currency accounts")

    with entity_context(session, entity_id):
        require_entity_context()
        if payload.account_kind == MoneyAccountKind.FOREIGN_CURRENCY:
            assert currency is not None
            bucket = _get_bucket_by_code(session, FX_BUCKET_CODE_BY_CURRENCY[currency])
        else:
            bucket = _get_bucket_account(session, payload.account_kind)
        code = _next_sub_account_code(session, bucket)

        gl_account = Account(
            code=code,
            name_en=payload.name,
            name_tr=payload.name,
            account_type=bucket.account_type,
            normal_balance=bucket.normal_balance,
            accepts_opening_balance=True,
            parent_account_id=bucket.id,
        )
        session.add(gl_account)
        session.flush()

        money_account = MoneyAccount(
            account_kind=payload.account_kind,
            currency=currency,
            name=payload.name,
            gl_account_id=gl_account.id,
            bank_name=payload.bank_name,
            iban=payload.iban,
            last_four=payload.last_four,
        )
        session.add(money_account)
        try:
            if commit:
                session.commit()
                session.refresh(money_account)
                session.refresh(gl_account)
            else:
                session.flush()
        except IntegrityError as exc:
            session.rollback()
            raise DuplicateMoneyAccountError(
                f"Money account named {payload.name!r} already exists for this entity"
            ) from exc
        return _to_read(session, money_account, gl_account)


def list_money_accounts(
    session: Session,
    entity_id: uuid.UUID,
    *,
    account_kind: MoneyAccountKind | None = None,
    include_inactive: bool = False,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[MoneyAccountRead], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if account_kind is not None:
            filters.append(MoneyAccount.account_kind == account_kind)
        if not include_inactive:
            filters.append(MoneyAccount.is_active.is_(True))
        search = text_search_filter(q, MoneyAccount.name)
        if search is not None:
            filters.append(search)
        stmt = select(MoneyAccount).where(*filters).order_by(MoneyAccount.name)
        accounts, total = fetch_paginated(session, stmt, params)

        results: list[MoneyAccountRead] = []
        for money_account in accounts:
            gl_account = session.get(Account, money_account.gl_account_id)
            assert gl_account is not None
            results.append(_to_read(session, money_account, gl_account))
        return results, total


def get_money_account(
    session: Session, entity_id: uuid.UUID, money_account_id: uuid.UUID
) -> MoneyAccountRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        money_account = session.get(MoneyAccount, money_account_id)
        if money_account is None:
            raise LookupError("Money account not found")
        gl_account = session.get(Account, money_account.gl_account_id)
        assert gl_account is not None
        return _to_read(session, money_account, gl_account)


def update_money_account(
    session: Session,
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    payload: MoneyAccountUpdate,
) -> MoneyAccountRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        money_account = session.get(MoneyAccount, money_account_id)
        if money_account is None:
            raise LookupError("Money account not found")

        gl_account = session.get(Account, money_account.gl_account_id)
        assert gl_account is not None

        if payload.name is not None:
            money_account.name = payload.name
            gl_account.name_en = payload.name
            gl_account.name_tr = payload.name
        if payload.bank_name is not None:
            money_account.bank_name = payload.bank_name
        if payload.iban is not None:
            money_account.iban = payload.iban
        if payload.last_four is not None:
            money_account.last_four = payload.last_four
        if payload.is_active is not None:
            money_account.is_active = payload.is_active
            gl_account.is_active = payload.is_active

        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise DuplicateMoneyAccountError(
                f"Money account named {payload.name!r} already exists for this entity"
            ) from exc
        session.refresh(money_account)
        session.refresh(gl_account)
        return _to_read(session, money_account, gl_account)


def _build_branch(
    session: Session,
    kind: MoneyAccountKind,
    *,
    currency: str | None = None,
    include_inactive: bool = False,
) -> MoneyAccountTreeBranch:
    if kind == MoneyAccountKind.FOREIGN_CURRENCY:
        if currency is None:
            raise InvalidMoneyAccountError("currency is required for foreign currency branch")
        bucket_code = FX_BUCKET_CODE_BY_CURRENCY[currency]
        bucket = _get_bucket_by_code(session, bucket_code)
        query = (
            select(MoneyAccount)
            .where(
                MoneyAccount.account_kind == kind,
                MoneyAccount.currency == currency,
            )
            .order_by(MoneyAccount.name)
        )
    else:
        bucket = _get_bucket_account(session, kind)
        query = (
            select(MoneyAccount)
            .where(MoneyAccount.account_kind == kind)
            .order_by(MoneyAccount.name)
        )

    if not include_inactive:
        query = query.where(MoneyAccount.is_active.is_(True))

    leaves: list[MoneyAccountTreeLeaf] = []
    child_balances: list[int] = []
    for money_account in session.scalars(query):
        gl_account = session.get(Account, money_account.gl_account_id)
        assert gl_account is not None
        balance = gl_balance_kurus(session, gl_account.id, gl_account.normal_balance)
        child_balances.append(balance)
        native_quantity: int | None = None
        if kind == MoneyAccountKind.FOREIGN_CURRENCY:
            from app.core.fx.ledger import native_quantity_balance

            native_quantity = native_quantity_balance(
                session, money_account.entity_id, money_account.id
            )
        leaves.append(
            MoneyAccountTreeLeaf(
                id=money_account.id,
                name=money_account.name,
                account_kind=money_account.account_kind,
                currency=money_account.currency,
                gl_account_id=gl_account.id,
                gl_account_code=gl_account.code,
                bank_name=money_account.bank_name,
                iban=money_account.iban,
                last_four=money_account.last_four,
                is_active=money_account.is_active,
                balance_kurus=balance,
                native_quantity=native_quantity,
            )
        )

    return MoneyAccountTreeBranch(
        bucket_code=bucket.code,
        bucket_name_en=bucket.name_en,
        bucket_name_tr=bucket.name_tr,
        bucket_gl_account_id=bucket.id,
        balance_kurus=rollup_child_balances(child_balances),
        accounts=leaves,
    )


def get_account_tree(
    session: Session,
    entity_id: uuid.UUID,
    *,
    include_inactive: bool = False,
) -> MoneyAccountTree:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        return MoneyAccountTree(
            banks=_build_branch(
                session, MoneyAccountKind.BANK, include_inactive=include_inactive
            ),
            cash=_build_branch(
                session, MoneyAccountKind.CASH, include_inactive=include_inactive
            ),
            credit_cards=_build_branch(
                session, MoneyAccountKind.CREDIT_CARD, include_inactive=include_inactive
            ),
            foreign_currency=ForeignCurrencyTree(
                usd=_build_branch(
                    session,
                    MoneyAccountKind.FOREIGN_CURRENCY,
                    currency="USD",
                    include_inactive=include_inactive,
                ),
                eur=_build_branch(
                    session,
                    MoneyAccountKind.FOREIGN_CURRENCY,
                    currency="EUR",
                    include_inactive=include_inactive,
                ),
                gbp=_build_branch(
                    session,
                    MoneyAccountKind.FOREIGN_CURRENCY,
                    currency="GBP",
                    include_inactive=include_inactive,
                ),
            ),
        )
