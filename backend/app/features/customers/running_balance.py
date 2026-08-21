"""Stamp customer ledger running balances once for screen and export."""

from __future__ import annotations

from app.core.ledger.subledger_display import SubledgerDisplayKind
from app.features.customers.schema import CustomerLedgerEntryRead


def stamp_running_balances(reads: list[CustomerLedgerEntryRead]) -> None:
    """Accumulate over the same list the screen shows; export must reuse this."""
    running = 0
    for read in reads:
        if read.display_kind == SubledgerDisplayKind.EFFECTIVE:
            running += read.amount_kurus
        read.running_balance_kurus = running
