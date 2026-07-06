"""Lightweight review queue counts for nav badges."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ReviewTabCounts(BaseModel):
    bank: int = 0
    sales: int = 0
    receipts: int = 0
    invoices: int = 0
    expenses: int = 0
    delivery: int = 0


class ReviewCountsRead(BaseModel):
    total: int = Field(description="Sum of actionable review-tab counts")
    by_tab: ReviewTabCounts
    invoices_pending: int = Field(
        default=0,
        description="Invoice drafts in draft/needs_review/duplicate",
    )
    invoices_ready_to_post: int = Field(
        default=0,
        description="Confirmed invoice drafts awaiting post-to-ledger",
    )
