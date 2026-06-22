"""FastAPI entry — wires routes and middleware only. No business logic (ARCHITECTURE.md)."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.features.entities.api import router as entities_router
from app.features.chart_of_accounts.api import router as chart_of_accounts_router
from app.features.ledger.api import router as ledger_router
from app.features.manual_journals.api import router as manual_journals_router
from app.features.invoices.api import router as invoices_router
from app.features.onboarding.api import router as onboarding_router
from app.features.onboarding.chart_api import router as chart_router
from app.features.suppliers.api import router as suppliers_router
from app.features.payables.api import router as payables_router
from app.features.banking.api import router as banking_router
from app.features.banking.statements_api import (
    accounts_router as banking_statements_accounts_router,
    statements_router as banking_statements_router,
)
from app.features.banking.transfers_api import router as banking_transfers_router
from app.features.pos.api import (
    card_sales_router,
    reconciliation_router,
    settlements_router,
)
from app.features.cash.api import movements_router as cash_movements_router
from app.features.cash.api import sessions_router as cash_sessions_router
from app.features.fx.api import router as fx_router
from app.features.staff.api import router as staff_router
from app.features.partners.api import router as partners_router
from app.features.customers.api import router as customers_router
from app.features.receivables.api import router as receivables_router

app = FastAPI(
    title="Mizan API",
    description="Restaurant bookkeeping API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(entities_router)
app.include_router(chart_of_accounts_router)
app.include_router(ledger_router)
app.include_router(manual_journals_router)
app.include_router(invoices_router)
app.include_router(onboarding_router)
app.include_router(chart_router)
app.include_router(suppliers_router)
app.include_router(payables_router)
app.include_router(banking_router)
app.include_router(banking_statements_accounts_router)
app.include_router(banking_statements_router)
app.include_router(banking_transfers_router)
app.include_router(settlements_router)
app.include_router(card_sales_router)
app.include_router(reconciliation_router)
app.include_router(cash_movements_router)
app.include_router(cash_sessions_router)
app.include_router(fx_router)
app.include_router(staff_router)
app.include_router(partners_router)
app.include_router(customers_router)
app.include_router(receivables_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check for dev and deploy."""
    return {"status": "ok", "service": "mizan-api"}


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Mizan API", "docs": "/docs"}
