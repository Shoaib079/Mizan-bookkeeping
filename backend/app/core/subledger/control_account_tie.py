"""Registry-driven control-account tie guards for subledgers (Phase 8.6 Item 0)."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_PAYABLE_CODE,
    ACCOUNTS_RECEIVABLE_CODE,
    EMPLOYEE_ADVANCES_CODE,
    PARTNER_REIMBURSEMENT_PAYABLE_CODE,
    SALARIES_PAYABLE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.fx import ledger as fx_ledger
from app.core.partners import ledger as partner_ledger
from app.core.payables.models import SupplierLedgerEntry
from app.core.receivables.models import CustomerLedgerEntry
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import StaffMovementType
from app.db.base import EntityScopedMixin
from app.db.session import entity_context, require_entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccount, MoneyAccountKind

BalanceFn = Callable[[Session, uuid.UUID], int]
NormalSide = Literal["asset", "liability"]


@dataclass(frozen=True, slots=True)
class ControlAccountTie:
    """Maps one subledger table to one GL control account balance function."""

    table_name: str
    account_code: str
    balance_fn: BalanceFn
    normal_side: NormalSide


def discover_subledger_tables() -> frozenset[str]:
    """Discover all *_ledger_entries tables (subledgers tied to a GL control account)."""
    import app.db.bootstrap  # noqa: F401 — load model registry

    tables: set[str] = set()

    def walk(cls: type) -> None:
        for sub in cls.__subclasses__():
            tablename = getattr(sub, "__tablename__", None)
            if tablename and tablename.endswith("_ledger_entries"):
                tables.add(tablename)
            walk(sub)

    walk(EntityScopedMixin)
    return frozenset(tables)


def _gl_balance(
    db_session: Session,
    entity_id: uuid.UUID,
    account_code: str,
    normal_side: NormalSide,
) -> int:
    with entity_context(db_session, entity_id):
        account = db_session.scalar(select(Account).where(Account.code == account_code))
        if account is None:
            raise LookupError(f"chart account {account_code} not found")
        normal = (
            AccountNormalBalance.CREDIT
            if normal_side == "liability"
            else AccountNormalBalance.DEBIT
        )
        return banking_service.gl_balance_kurus(db_session, account.id, normal)


def supplier_subledger_total(db_session: Session, entity_id: uuid.UUID) -> int:
    with entity_context(db_session, entity_id):
        total = db_session.scalar(
            select(func.coalesce(func.sum(SupplierLedgerEntry.amount_kurus), 0))
        )
        return int(total or 0)


def customer_subledger_total(db_session: Session, entity_id: uuid.UUID) -> int:
    with entity_context(db_session, entity_id):
        total = db_session.scalar(
            select(func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0))
        )
        return int(total or 0)


def staff_salaries_payable_subledger_total(db_session: Session, entity_id: uuid.UUID) -> int:
    """Subledger movements that post to 2250 salaries payable."""
    payable_types = (
        StaffMovementType.OPENING_BALANCE,
        StaffMovementType.SALARY_ACCRUED,
        StaffMovementType.SALARY_PAYMENT,
    )
    with entity_context(db_session, entity_id):
        total = db_session.scalar(
            select(func.coalesce(func.sum(StaffLedgerEntry.amount_minor), 0)).where(
                StaffLedgerEntry.movement_type.in_(payable_types)
            )
        )
        return int(total or 0)


def staff_employee_advances_subledger_total(db_session: Session, entity_id: uuid.UUID) -> int:
    """Net employee advances in subledger (positive = outstanding asset)."""
    advance_types = (
        StaffMovementType.ADVANCE_PAID,
        StaffMovementType.ADVANCE_APPLIED,
    )
    with entity_context(db_session, entity_id):
        total = db_session.scalar(
            select(func.coalesce(func.sum(StaffLedgerEntry.amount_minor), 0)).where(
                StaffLedgerEntry.movement_type.in_(advance_types)
            )
        )
        return -int(total or 0)


def partner_subledger_total(db_session: Session, entity_id: uuid.UUID) -> int:
    return partner_ledger.entity_total_balance_kurus(db_session, entity_id)


def fx_try_cost_subledger_total(db_session: Session, entity_id: uuid.UUID) -> int:
    """Aggregate FX subledger TRY cost across all active FX wallets."""
    with entity_context(db_session, entity_id):
        require_entity_context()
        wallets = list(
            db_session.scalars(
                select(MoneyAccount).where(
                    MoneyAccount.is_active.is_(True),
                    MoneyAccount.account_kind == MoneyAccountKind.FOREIGN_CURRENCY,
                )
            )
        )
        return sum(
            fx_ledger.try_cost_balance_kurus(db_session, entity_id, wallet.id)
            for wallet in wallets
        )


def fx_gl_try_cost_total(db_session: Session, entity_id: uuid.UUID) -> int:
    """Sum GL debit balances for all active FX wallet GL accounts."""
    with entity_context(db_session, entity_id):
        require_entity_context()
        wallets = list(
            db_session.scalars(
                select(MoneyAccount).where(
                    MoneyAccount.is_active.is_(True),
                    MoneyAccount.account_kind == MoneyAccountKind.FOREIGN_CURRENCY,
                )
            )
        )
        total = 0
        for wallet in wallets:
            total += banking_service.gl_balance_kurus(
                db_session,
                wallet.gl_account_id,
                AccountNormalBalance.DEBIT,
            )
        return total


CONTROL_ACCOUNT_TIES: tuple[ControlAccountTie, ...] = (
    ControlAccountTie(
        table_name="supplier_ledger_entries",
        account_code=ACCOUNTS_PAYABLE_CODE,
        balance_fn=supplier_subledger_total,
        normal_side="liability",
    ),
    ControlAccountTie(
        table_name="customer_ledger_entries",
        account_code=ACCOUNTS_RECEIVABLE_CODE,
        balance_fn=customer_subledger_total,
        normal_side="asset",
    ),
    ControlAccountTie(
        table_name="staff_ledger_entries",
        account_code=SALARIES_PAYABLE_CODE,
        balance_fn=staff_salaries_payable_subledger_total,
        normal_side="liability",
    ),
    ControlAccountTie(
        table_name="staff_ledger_entries",
        account_code=EMPLOYEE_ADVANCES_CODE,
        balance_fn=staff_employee_advances_subledger_total,
        normal_side="asset",
    ),
    ControlAccountTie(
        table_name="partner_ledger_entries",
        account_code=PARTNER_REIMBURSEMENT_PAYABLE_CODE,
        balance_fn=partner_subledger_total,
        normal_side="liability",
    ),
    ControlAccountTie(
        table_name="fx_ledger_entries",
        account_code="fx_wallets_aggregate",
        balance_fn=fx_try_cost_subledger_total,
        normal_side="asset",
    ),
)


def verify_control_account_tie_registry_complete() -> None:
    """Fail fast if a discovered subledger table is missing from CONTROL_ACCOUNT_TIES."""
    discovered = discover_subledger_tables()
    registered = frozenset(tie.table_name for tie in CONTROL_ACCOUNT_TIES)
    missing = discovered - registered
    extra = registered - discovered
    if missing:
        raise AssertionError(
            f"Subledger tables missing from CONTROL_ACCOUNT_TIES: {sorted(missing)}"
        )
    if extra:
        raise AssertionError(
            f"CONTROL_ACCOUNT_TIES entries with no subledger model: {sorted(extra)}"
        )


def assert_entity_control_accounts_tied(db_session: Session, entity_id: uuid.UUID) -> None:
    """Assert every registered tie matches GL for one entity."""
    verify_control_account_tie_registry_complete()
    mismatches: list[str] = []
    for tie in CONTROL_ACCOUNT_TIES:
        if tie.account_code == "fx_wallets_aggregate":
            subledger = fx_try_cost_subledger_total(db_session, entity_id)
            gl_balance = fx_gl_try_cost_total(db_session, entity_id)
        else:
            subledger = tie.balance_fn(db_session, entity_id)
            gl_balance = _gl_balance(db_session, entity_id, tie.account_code, tie.normal_side)
        if subledger != gl_balance:
            mismatches.append(
                f"{tie.table_name}→{tie.account_code}: subledger={subledger} gl={gl_balance}"
            )
    if mismatches:
        raise AssertionError(
            "Control-account tie mismatch:\n" + "\n".join(mismatches)
        )
