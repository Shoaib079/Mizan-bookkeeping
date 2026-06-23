"""Tips pass-through service — accrual, payout, balance (Decisions §9)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import TIPS_PAYABLE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.tips.posting import post_tip_accrual, post_tip_payout
from app.db.session import entity_context, require_entity_context
from app.core.listing import (
    ListParams,
    amount_range_filters,
    date_range_filters,
    fetch_paginated,
    text_search_filter,
)
from app.features.banking import service as banking_service
from app.features.entities import service as entity_service
from app.features.tips.models import TipAccrual, TipPayout
from app.features.tips.schema import (
    TipAccrualCreate,
    TipAccrualRead,
    TipPayoutCreate,
    TipPayoutRead,
    TipsBalanceRead,
)


def _to_accrual_read(accrual: TipAccrual) -> TipAccrualRead:
    return TipAccrualRead(
        id=accrual.id,
        entity_id=accrual.entity_id,
        accrual_date=accrual.accrual_date,
        amount_kurus=accrual.amount_kurus,
        source=accrual.source,
        money_account_id=accrual.money_account_id,
        description=accrual.description,
        actor_id=accrual.actor_id,
        journal_entry_id=accrual.journal_entry_id,
        created_at=accrual.created_at,
    )


def _to_payout_read(payout: TipPayout) -> TipPayoutRead:
    return TipPayoutRead(
        id=payout.id,
        entity_id=payout.entity_id,
        payout_date=payout.payout_date,
        amount_kurus=payout.amount_kurus,
        money_account_id=payout.money_account_id,
        description=payout.description,
        actor_id=payout.actor_id,
        journal_entry_id=payout.journal_entry_id,
        created_at=payout.created_at,
    )


def create_tip_accrual(
    session: Session,
    entity_id: uuid.UUID,
    payload: TipAccrualCreate,
) -> TipAccrualRead:
    result = post_tip_accrual(
        session,
        entity_id,
        accrual_date=payload.accrual_date,
        amount_kurus=payload.amount_kurus,
        source=payload.source,
        description=payload.description,
        actor_id=payload.actor_id,
        money_account_id=payload.money_account_id,
    )
    return _to_accrual_read(result.tip_accrual)


def list_tip_accruals(
    session: Session,
    entity_id: uuid.UUID,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    money_account_id: uuid.UUID | None = None,
    min_amount: int | None = None,
    max_amount: int | None = None,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[TipAccrualRead], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if money_account_id is not None:
            filters.append(TipAccrual.money_account_id == money_account_id)
        filters.extend(
            date_range_filters(
                TipAccrual.accrual_date, from_date=from_date, to_date=to_date
            )
        )
        filters.extend(
            amount_range_filters(
                TipAccrual.amount_kurus,
                min_amount=min_amount,
                max_amount=max_amount,
            )
        )
        search = text_search_filter(q, TipAccrual.description)
        if search is not None:
            filters.append(search)
        stmt = (
            select(TipAccrual)
            .where(*filters)
            .order_by(
                TipAccrual.accrual_date.desc(),
                TipAccrual.created_at.desc(),
            )
        )
        accruals, total = fetch_paginated(session, stmt, params)
        return [_to_accrual_read(item) for item in accruals], total


def create_tip_payout(
    session: Session,
    entity_id: uuid.UUID,
    payload: TipPayoutCreate,
) -> TipPayoutRead:
    result = post_tip_payout(
        session,
        entity_id,
        payout_date=payload.payout_date,
        amount_kurus=payload.amount_kurus,
        money_account_id=payload.money_account_id,
        description=payload.description,
        actor_id=payload.actor_id,
    )
    return _to_payout_read(result.tip_payout)


def list_tip_payouts(
    session: Session,
    entity_id: uuid.UUID,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    money_account_id: uuid.UUID | None = None,
    min_amount: int | None = None,
    max_amount: int | None = None,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[TipPayoutRead], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if money_account_id is not None:
            filters.append(TipPayout.money_account_id == money_account_id)
        filters.extend(
            date_range_filters(
                TipPayout.payout_date, from_date=from_date, to_date=to_date
            )
        )
        filters.extend(
            amount_range_filters(
                TipPayout.amount_kurus,
                min_amount=min_amount,
                max_amount=max_amount,
            )
        )
        search = text_search_filter(q, TipPayout.description)
        if search is not None:
            filters.append(search)
        stmt = (
            select(TipPayout)
            .where(*filters)
            .order_by(
                TipPayout.payout_date.desc(),
                TipPayout.created_at.desc(),
            )
        )
        payouts, total = fetch_paginated(session, stmt, params)
        return [_to_payout_read(item) for item in payouts], total


def get_tips_balance(session: Session, entity_id: uuid.UUID) -> TipsBalanceRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        tips_payable = session.scalar(
            select(Account).where(Account.code == TIPS_PAYABLE_CODE)
        )
        if tips_payable is None:
            raise LookupError("Tips Payable account not found — seed chart first")

        balance = banking_service.gl_balance_kurus(
            session,
            tips_payable.id,
            AccountNormalBalance.CREDIT,
        )
        return TipsBalanceRead(balance_kurus=balance)
