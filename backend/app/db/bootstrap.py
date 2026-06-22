"""Optional local bootstrap via create_all — NOT the production provisioning path.

Production and pytest use ``alembic upgrade head`` (see ``app.db.provisioning``).
"""

from sqlalchemy import create_engine, text

from app.config import settings
from app.db.base import Base
from app.db.provisioning import apply_database_integrity
from app.features.entities.models import Entity, EntitySetting  # noqa: F401
from app.core.chart_of_accounts.models import Account  # noqa: F401
from app.core.ledger.models import JournalEntry, JournalEntryLine, LedgerAuditEvent  # noqa: F401
from app.features.invoices.models import InvoiceDraft  # noqa: F401
from app.features.suppliers.models import Supplier  # noqa: F401
from app.core.payables.models import SupplierLedgerEntry  # noqa: F401
from app.features.banking.models import MoneyAccount  # noqa: F401
from app.features.banking.credit_card_payment_models import CreditCardPayment  # noqa: F401
from app.features.banking.statement_models import BankStatement, BankStatementLine  # noqa: F401
from app.features.banking.transfer_models import AccountTransfer  # noqa: F401
from app.core.fx.models import FxLedgerEntry  # noqa: F401
from app.features.cash.models import CashDrawerSession, CashMovement  # noqa: F401
from app.features.staff.models import Employee  # noqa: F401
from app.core.staff.models import StaffLedgerEntry  # noqa: F401
from app.features.partners.models import Partner  # noqa: F401
from app.core.partners.models import PartnerLedgerEntry  # noqa: F401
from app.features.customers.models import Customer  # noqa: F401
from app.core.receivables.models import CustomerLedgerEntry  # noqa: F401
from app.features.pos.models import CardSalesBatch, PosDailySummary, PosSettlement  # noqa: F401
from app.features.delivery.models import DeliveryReport, DeliverySettlement, OwnedDeliveryPlatform  # noqa: F401
from app.features.tips.models import TipAccrual, TipPayout  # noqa: F401
from app.features.expenses.models import ExpenseEntry, ExpenseItem, ExpenseItemAlias  # noqa: F401
from app.features.auth.models import EntityMembership, User, AuthAuditEvent  # noqa: F401


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
        apply_database_integrity(connection)
    engine.dispose()


def ensure_test_database() -> None:
    ensure_mizan_role_and_databases()
