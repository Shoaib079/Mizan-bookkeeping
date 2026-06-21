"""Alembic migrations for Mizan PostgreSQL schema."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import settings
from app.db.base import Base
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

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
