"""Create tables and apply PostgreSQL RLS — dev/test bootstrap."""

from sqlalchemy import create_engine, text

from app.config import settings
from app.db.base import Base
from app.db.ledger_immutability import apply_ledger_immutability
from app.db.payables_immutability import apply_payables_immutability
from app.db.rls import apply_entity_rls
from app.features.entities.models import Entity, EntitySetting  # noqa: F401
from app.core.chart_of_accounts.models import Account  # noqa: F401
from app.core.ledger.models import JournalEntry, JournalEntryLine, LedgerAuditEvent  # noqa: F401
from app.features.invoices.models import InvoiceDraft  # noqa: F401
from app.features.suppliers.models import Supplier  # noqa: F401
from app.core.payables.models import SupplierLedgerEntry  # noqa: F401
from app.features.banking.models import MoneyAccount  # noqa: F401
from app.features.banking.statement_models import BankStatement, BankStatementLine  # noqa: F401
from app.features.banking.transfer_models import AccountTransfer  # noqa: F401
from app.features.pos.models import PosSettlement  # noqa: F401


def ensure_mizan_role_and_databases() -> None:
    """Create mizan role + app/test DBs when using local Postgres (no Docker yet)."""
    admin_engine = create_engine(settings.database_admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(
            text(
                """
                DO $$ BEGIN
                    CREATE ROLE mizan LOGIN PASSWORD 'mizan_dev';
                EXCEPTION WHEN duplicate_object THEN NULL;
                END $$;
                """
            )
        )
        for db_name in ("mizan", "mizan_test"):
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": db_name},
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{db_name}" OWNER mizan'))
    admin_engine.dispose()


def init_database(url: str | None = None) -> None:
    engine = create_engine(url or settings.database_url, pool_pre_ping=True)
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        apply_entity_rls(connection)
        apply_ledger_immutability(connection)
        apply_payables_immutability(connection)
    engine.dispose()


def ensure_test_database() -> None:
    ensure_mizan_role_and_databases()
