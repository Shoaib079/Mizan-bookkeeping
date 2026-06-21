"""FastAPI entry — wires routes and middleware only. No business logic (ARCHITECTURE.md)."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.features.entities.api import router as entities_router
from app.features.chart_of_accounts.api import router as chart_of_accounts_router
from app.features.ledger.api import router as ledger_router
from app.features.onboarding.api import router as onboarding_router
from app.features.onboarding.chart_api import router as chart_router

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
app.include_router(onboarding_router)
app.include_router(chart_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check for dev and deploy."""
    return {"status": "ok", "service": "mizan-api"}


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Mizan API", "docs": "/docs"}
