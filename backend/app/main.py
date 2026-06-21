"""FastAPI entry — wires routes and middleware only. No business logic (ARCHITECTURE.md)."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check for dev and deploy."""
    return {"status": "ok", "service": "mizan-api"}


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Mizan API", "docs": "/docs"}
