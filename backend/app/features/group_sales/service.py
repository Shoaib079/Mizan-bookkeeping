"""Group / agency sales — menus, posting, void, correct."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.chart_of_accounts.default_chart import GROUP_SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.ledger.models import JournalEntrySource, journal_void_update_allowed
from app.core.ledger.correction import _append_customer_reversal, _void_journal_entry_in_transaction
from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.core.receivables import ledger as receivables_ledger
from app.core.receivables import posting as receivables_posting
from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables.types import CustomerMovementType
from app.core.duplicate_guard import (
    ensure_not_duplicate,
    find_duplicate_credit_sale,
)
from app.db.session import entity_context, require_entity_context
from app.features.customers.models import Customer
from app.features.entities import service as entity_service
from app.features.group_sales.calculations import compute_group_sale
from app.features.group_sales.fx_receivable import native_balance_for_currency, remaining_on_group_sale
from app.features.group_sales.models import GroupMenu, GroupSale, GroupSaleLine, GroupSaleStatus
from app.features.group_sales.schema import (
    GROUP_SALE_REFERENCE,
    GroupMenuCreate,
    GroupMenuUpdate,
    GroupSaleCreate,
    GroupSaleRead,
)


class GroupSaleError(ValueError):
    """Group sale validation or state error."""


class GroupSaleHasPaymentsError(GroupSaleError):
    """Cannot void or edit while payments are linked."""


def _require_entity(session: Session, entity_id: uuid.UUID) -> None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")


def _group_sales_revenue_account(session: Session) -> Account:
    account = session.scalar(select(Account).where(Account.code == GROUP_SALES_REVENUE_CODE))
    if account is None:
        raise LookupError("Group sales revenue account 4300 not found")
    return account


def _menu_name_map(session: Session, lines: list) -> dict[uuid.UUID, str]:
    menu_ids = {line.group_menu_id for line in lines if line.group_menu_id is not None}
    if not menu_ids:
        return {}
    rows = session.scalars(select(GroupMenu).where(GroupMenu.id.in_(menu_ids))).all()
    return {row.id: row.name for row in rows}


def create_group_menu(
    session: Session, entity_id: uuid.UUID, payload: GroupMenuCreate
) -> GroupMenu:
    _require_entity(session, entity_id)
    with entity_context(session, entity_id):
        menu = GroupMenu(name=payload.name.strip())
        session.add(menu)
        session.commit()
        session.refresh(menu)
        return menu


def update_group_menu(
    session: Session,
    entity_id: uuid.UUID,
    menu_id: uuid.UUID,
    payload: GroupMenuUpdate,
) -> GroupMenu:
    _require_entity(session, entity_id)
    with entity_context(session, entity_id):
        menu = session.get(GroupMenu, menu_id)
        if menu is None:
            raise LookupError("Group menu not found")
        if payload.name is not None:
            menu.name = payload.name.strip()
        if payload.is_active is not None:
            menu.is_active = payload.is_active
        session.commit()
        session.refresh(menu)
        return menu


def list_group_menus(
    session: Session,
    entity_id: uuid.UUID,
    *,
    include_inactive: bool = False,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[GroupMenu], int]:
    _require_entity(session, entity_id)
    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if not include_inactive:
            filters.append(GroupMenu.is_active.is_(True))
        search = text_search_filter(q, GroupMenu.name)
        if search is not None:
            filters.append(search)
        stmt = select(GroupMenu).where(*filters).order_by(GroupMenu.name)
        return fetch_paginated(session, stmt, params)


def _has_linked_payments(session: Session, group_sale_id: uuid.UUID) -> bool:
    """True only if a live (net, un-reversed) payment is applied to this sale.

    Payments reduce AR (negative amount_kurus); a voided/corrected payment appends
    an equal-and-opposite PAYMENT_RECEIVED reversal row carrying the same group-sale
    reference. So a fully-reversed payment nets to zero and no longer blocks void.
    """
    net = session.scalar(
        select(func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0)).where(
            CustomerLedgerEntry.reference_type == GROUP_SALE_REFERENCE,
            CustomerLedgerEntry.reference_id == group_sale_id,
            CustomerLedgerEntry.movement_type == CustomerMovementType.PAYMENT_RECEIVED,
        )
    )
    return int(net or 0) != 0


def post_group_sale(
    session: Session,
    entity_id: uuid.UUID,
    payload: GroupSaleCreate,
    *,
    amends_group_sale_id: uuid.UUID | None = None,
) -> GroupSale:
    _require_entity(session, entity_id)
    with entity_context(session, entity_id):
        require_entity_context()
        customer = session.get(Customer, payload.customer_id)
        if customer is None:
            raise LookupError("Customer not found")

        menu_names = _menu_name_map(session, payload.lines)
        computed = compute_group_sale(payload, menu_names)
        ensure_not_duplicate(
            find_duplicate_credit_sale(
                session,
                customer_id=payload.customer_id,
                sale_date=payload.sale_date,
                amount_kurus=computed.total_kurus,
            ),
            acknowledged=payload.acknowledge_duplicate,
        )
        revenue = _group_sales_revenue_account(session)

        group_sale = GroupSale(
            customer_id=payload.customer_id,
            sale_date=payload.sale_date,
            description=payload.description.strip(),
            currency=computed.currency,
            status=GroupSaleStatus.POSTED.value,
            total_kurus=computed.total_kurus,
            forex_currency=computed.forex_currency,
            total_forex_minor=computed.total_forex_minor,
            fx_rate_used=computed.fx_rate_used,
            actor_id=payload.actor_id,
            amends_group_sale_id=amends_group_sale_id,
        )
        session.add(group_sale)
        session.flush()

        result = receivables_posting.post_credit_sale(
            session,
            entity_id,
            payload.customer_id,
            sale_date=payload.sale_date,
            amount_kurus=computed.total_kurus,
            description=payload.description.strip(),
            actor_id=payload.actor_id,
            revenue_account_id=revenue.id,
            forex_currency=computed.forex_currency,
            total_forex_minor=computed.total_forex_minor,
            reference_type=GROUP_SALE_REFERENCE,
            reference_id=group_sale.id,
            journal_source=JournalEntrySource.GROUP_SALE,
        )

        group_sale.journal_entry_id = result.journal_entry.id
        group_sale.customer_ledger_entry_id = result.customer_ledger_entry.id

        for line in computed.lines:
            session.add(
                GroupSaleLine(
                    group_sale_id=group_sale.id,
                    group_menu_id=line.group_menu_id,
                    menu_name_snapshot=line.menu_name_snapshot,
                    pax=line.pax,
                    rate_per_person_minor=line.rate_per_person_minor,
                    line_total_minor=line.line_total_minor,
                    line_total_kurus=line.line_total_kurus,
                )
            )

        if amends_group_sale_id is not None:
            original = session.get(GroupSale, amends_group_sale_id)
            if original is None:
                raise LookupError("Original group sale not found")
            original.amended_by_group_sale_id = group_sale.id

        session.commit()
        session.refresh(group_sale)
        return group_sale


def get_group_sale(
    session: Session, entity_id: uuid.UUID, group_sale_id: uuid.UUID
) -> GroupSale:
    _require_entity(session, entity_id)
    with entity_context(session, entity_id):
        sale = session.scalar(
            select(GroupSale)
            .options(selectinload(GroupSale.lines))
            .where(GroupSale.id == group_sale_id)
        )
        if sale is None:
            raise LookupError("Group sale not found")
        return sale


def list_group_sales(
    session: Session,
    entity_id: uuid.UUID,
    *,
    customer_id: uuid.UUID | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[GroupSale], int]:
    _require_entity(session, entity_id)
    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if customer_id is not None:
            filters.append(GroupSale.customer_id == customer_id)
        stmt = (
            select(GroupSale)
            .options(selectinload(GroupSale.lines))
            .where(*filters)
            .order_by(GroupSale.sale_date.desc(), GroupSale.created_at.desc())
        )
        return fetch_paginated(session, stmt, params)


def post_group_sale_discount(
    session: Session,
    entity_id: uuid.UUID,
    group_sale_id: uuid.UUID,
    *,
    discount_kurus: int,
    discount_native: int | None = None,
    description: str | None = None,
    actor_id: uuid.UUID,
    discount_date: date | None = None,
) -> GroupSale:
    """Write off the small unpaid remainder of a group sale to 5800 Sales Discounts."""
    _require_entity(session, entity_id)
    with entity_context(session, entity_id):
        require_entity_context()
        group_sale = session.get(GroupSale, group_sale_id)
        if group_sale is None:
            raise LookupError("Group sale not found")
        if group_sale.status != GroupSaleStatus.POSTED.value:
            raise GroupSaleError(
                f"Cannot discount group sale in status {group_sale.status!r}"
            )
        if discount_kurus <= 0:
            raise GroupSaleError("discount must be positive")
        remaining_kurus, remaining_native = remaining_on_group_sale(session, group_sale)
        if discount_kurus > remaining_kurus:
            raise GroupSaleError("discount exceeds remaining balance")
        if group_sale.forex_currency and discount_native is not None:
            if remaining_native is None or discount_native > remaining_native:
                raise GroupSaleError("discount exceeds remaining forex balance")
        customer_id = group_sale.customer_id
        forex_currency = group_sale.forex_currency
        sale_date = group_sale.sale_date

    receivables_posting.post_group_sale_discount(
        session,
        entity_id,
        customer_id,
        discount_date=discount_date or sale_date,
        discount_kurus=discount_kurus,
        description=(description or "Group sale discount").strip(),
        actor_id=actor_id,
        group_sale_id=group_sale_id,
        forex_currency=forex_currency,
        discount_native=discount_native,
    )

    with entity_context(session, entity_id):
        require_entity_context()
        return session.get(GroupSale, group_sale_id)


def _reverse_group_sale_gl(
    session: Session,
    entity_id: uuid.UUID,
    group_sale: GroupSale,
    *,
    actor_id: uuid.UUID,
    final_status: str,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> None:
    if _has_linked_payments(session, group_sale.id):
        raise GroupSaleHasPaymentsError(
            "Cannot void — void or settle the linked payment first"
        )
    if group_sale.journal_entry_id is None or group_sale.customer_ledger_entry_id is None:
        raise GroupSaleError("Group sale missing journal links")

    customer_row = session.get(CustomerLedgerEntry, group_sale.customer_ledger_entry_id)
    if customer_row is None:
        raise LookupError("Customer ledger entry not found")

    # Discount write-offs tied to this sale must be reversed too, so 5800 + AR unwind cleanly.
    discount_rows = list(
        session.scalars(
            select(CustomerLedgerEntry).where(
                CustomerLedgerEntry.reference_type == GROUP_SALE_REFERENCE,
                CustomerLedgerEntry.reference_id == group_sale.id,
                CustomerLedgerEntry.movement_type == CustomerMovementType.DISCOUNT,
            )
        ).all()
    )

    from app.core.period_locks.guards import mark_periods_dirty_for_dates

    with journal_void_update_allowed(session):
        _, reversal = _void_journal_entry_in_transaction(
            session,
            entity_id,
            group_sale.journal_entry_id,
            actor_id=actor_id,
            reason=reason,
            void_date=void_date,
            period_unlock_reason=period_unlock_reason,
        )
        _append_customer_reversal(
            session,
            customer_row,
            reversal,
            actor_id=actor_id,
            void_date=void_date,
        )
        for drow in discount_rows:
            if drow.journal_entry_id is None:
                continue
            _, drev = _void_journal_entry_in_transaction(
                session,
                entity_id,
                drow.journal_entry_id,
                actor_id=actor_id,
                reason=reason,
                void_date=void_date,
                period_unlock_reason=period_unlock_reason,
            )
            _append_customer_reversal(
                session,
                drow,
                drev,
                actor_id=actor_id,
                void_date=void_date,
            )
        group_sale.status = final_status
        session.flush()
        mark_periods_dirty_for_dates(
            session,
            entity_id,
            [group_sale.sale_date, reversal.entry_date],
        )


def void_group_sale(
    session: Session,
    entity_id: uuid.UUID,
    group_sale_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> GroupSale:
    _require_entity(session, entity_id)
    with entity_context(session, entity_id):
        require_entity_context()
        group_sale = session.get(GroupSale, group_sale_id)
        if group_sale is None:
            raise LookupError("Group sale not found")
        if group_sale.status != GroupSaleStatus.POSTED.value:
            raise GroupSaleError(f"Cannot void group sale in status {group_sale.status!r}")

        _reverse_group_sale_gl(
            session,
            entity_id,
            group_sale,
            actor_id=actor_id,
            final_status=GroupSaleStatus.VOIDED.value,
            reason=reason,
            void_date=void_date,
            period_unlock_reason=period_unlock_reason,
        )
        session.commit()
        session.refresh(group_sale)
        return group_sale


def correct_group_sale(
    session: Session,
    entity_id: uuid.UUID,
    group_sale_id: uuid.UUID,
    payload: GroupSaleCreate,
    *,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> GroupSale:
    _require_entity(session, entity_id)
    with entity_context(session, entity_id):
        original = session.get(GroupSale, group_sale_id)
        if original is None:
            raise LookupError("Group sale not found")
        if original.status != GroupSaleStatus.POSTED.value:
            raise GroupSaleError("Only posted group sales can be corrected")

        _reverse_group_sale_gl(
            session,
            entity_id,
            original,
            actor_id=payload.actor_id,
            final_status=GroupSaleStatus.AMENDED.value,
            reason=reason or "Correct group sale",
            void_date=void_date,
            period_unlock_reason=period_unlock_reason,
        )
        session.flush()

    new_sale = post_group_sale(
        session,
        entity_id,
        payload,
        amends_group_sale_id=group_sale_id,
    )
    return new_sale


def to_group_sale_read(session: Session, group_sale: GroupSale) -> GroupSaleRead:
    remaining_kurus, remaining_native = remaining_on_group_sale(session, group_sale)
    data = GroupSaleRead.model_validate(group_sale)
    return data.model_copy(
        update={
            "remaining_kurus": remaining_kurus,
            "remaining_forex_minor": remaining_native,
        }
    )


def customer_forex_balance(
    session: Session, entity_id: uuid.UUID, customer_id: uuid.UUID, currency: str
) -> int:
    _require_entity(session, entity_id)
    with entity_context(session, entity_id):
        return native_balance_for_currency(session, customer_id, currency)
