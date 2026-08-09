"""Read-only health checks over real books (HARDENING_PLAN.md Phase 0)."""

from app.core.health.books_health import CHECKS, Finding, run_books_health

__all__ = ["CHECKS", "Finding", "run_books_health"]
