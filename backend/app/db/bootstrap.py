"""Optional local bootstrap via create_all — NOT the production provisioning path.

Production and pytest use ``alembic upgrade head`` (see ``app.db.provisioning``).
"""

from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url

from app.config import settings
from app.db.base import Base
from app.db.provisioning import apply_database_integrity, APP_DB_ROLE
from app.core.chart_of_accounts.models import Account  # noqa: F401
from app.core.ledger.models import JournalEntry, JournalEntryLine, LedgerAuditEvent  # noqa: F401
from app.features.invoices.models import InvoiceDraft  # noqa: F401
from app.features.suppliers.models import Supplier  # noqa: F401
from app.core.payables.models import SupplierLedgerEntry  # noqa: F401
from app.features.banking.models import MoneyAccount  # noqa: F401
from app.features.banking.credit_card_payment_models import CreditCardPayment  # noqa: F401
from app.features.banking.statement_models import BankStatement, BankStatementLine  # noqa: F401
from app.features.banking.import_profile_models import BankImportProfile  # noqa: F401
from app.features.banking.classification_rule_models import StatementClassificationRule  # noqa: F401
from app.features.banking.transfer_models import AccountTransfer  # noqa: F401
from app.core.fx.models import FxLedgerEntry  # noqa: F401
from app.features.cash.models import CashDrawerSession, CashDrawerAuditEvent, CashMovement  # noqa: F401
from app.features.staff.models import Employee  # noqa: F401
from app.core.staff.models import StaffLedgerEntry  # noqa: F401
from app.features.partners.models import Partner  # noqa: F401
from app.core.partners.models import PartnerLedgerEntry  # noqa: F401
from app.features.customers.models import Customer  # noqa: F401
from app.core.receivables.models import CustomerLedgerEntry  # noqa: F401
from app.features.pos.models import CardSalesBatch, PosDailySummary, PosSettlement  # noqa: F401
from app.features.delivery.models import DeliveryReport, DeliverySettlement, OwnedDeliveryPlatform  # noqa: F401
from app.features.expenses.models import ExpenseEntry, ExpenseItem, ExpenseItemAlias  # noqa: F401
from app.features.auth.models import EntityMembership, User, AuthAuditEvent  # noqa: F401
from app.core.idempotency.models import IdempotencyRecord  # noqa: F401
from app.features.entities.models import Entity, EntitySetting  # noqa: F401


APP_DB_PASSWORD = "mizan_dev"


def ensure_mizan_app_role(conn) -> None:
    """Non-superuser app role — RLS applies (superuser mizan bypasses RLS)."""
    conn.execute(
        text(
            f"""
            DO $$ BEGIN
                CREATE ROLE {APP_DB_ROLE} LOGIN PASSWORD '{APP_DB_PASSWORD}'
                    NOSUPERUSER NOBYPASSRLS;
            EXCEPTION
                WHEN duplicate_object THEN NULL;
                WHEN insufficient_privilege THEN NULL;
            END $$;
            """
        )
    )
    conn.execute(
        text(
            f"""
            DO $$ BEGIN
                ALTER ROLE {APP_DB_ROLE} NOSUPERUSER NOBYPASSRLS;
            EXCEPTION
                WHEN insufficient_privilege THEN NULL;
            END $$;
            """
        )
    )
    row = conn.execute(
        text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = :rolname"),
        {"rolname": APP_DB_ROLE},
    ).first()
    if row is None:
        raise RuntimeError(f"PostgreSQL role {APP_DB_ROLE!r} does not exist after bootstrap")
    if row.rolsuper or row.rolbypassrls:
        raise RuntimeError(
            f"PostgreSQL role {APP_DB_ROLE!r} must not be superuser or BYPASSRLS "
            f"(rolsuper={row.rolsuper}, rolbypassrls={row.rolbypassrls})"
        )


def ensure_mizan_role_and_databases() -> None:
    """Create mizan role + app/test DBs when using local Postgres (no Docker yet)."""
    admin_engine = create_engine(settings.database_admin_url, isolation_level="AUTOCOMMIT")
    admin_user = (make_url(settings.database_admin_url).username or "").lower()
    with admin_engine.connect() as conn:
        # Docker Compose uses POSTGRES_USER=mizan — role already exists; skip CREATEROLE.
        if admin_user != "mizan":
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
        ensure_mizan_app_role(conn)
        for db_name in ("mizan", "mizan_test"):
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": db_name},
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{db_name}" OWNER mizan'))
            conn.execute(text(f'GRANT ALL PRIVILEGES ON DATABASE "{db_name}" TO {APP_DB_ROLE}'))
        # Docker POSTGRES_USER=mizan is superuser — keep NOBYPASSRLS for any direct use.
        conn.execute(text("ALTER ROLE mizan NOBYPASSRLS"))
    admin_engine.dispose()


def init_database(url: str | None = None) -> None:
    engine = create_engine(url or settings.database_url, pool_pre_ping=True)
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        apply_database_integrity(connection)
    engine.dispose()


def ensure_test_database() -> None:
    ensure_mizan_role_and_databases()
