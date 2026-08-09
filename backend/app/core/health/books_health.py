"""Read-only invariants over the real books (HARDENING_PLAN.md Phase 0).

Every other guard in this project reasons about code: does a registry match a
model list, does a path match a route. This module asks a different question —
*is the data in front of us self-consistent right now* — and it is the only
one that can find a fault nobody has noticed yet.

It exists because the machinery for the hardest check was already written and
had never been pointed at anything real. `assert_entity_control_accounts_tied`
walks every subledger against its GL control account, and its single caller
was a test against an **empty** entity. An empty entity ties trivially.

Three rules this module holds to:

- **It never writes.** No commits, no updates, not even a status correction
  when it finds one. A tool that fixes what it finds cannot be run in a panic,
  because you can no longer tell what it changed.
- **It reports; it does not raise.** A findings list can be triaged. An
  exception stops at the first problem and hides the rest — and the first
  problem is rarely the worst one.
- **Every check names what it would have caught.** A check nobody can explain
  gets ignored the first time it fires on a Friday.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.ledger.models import (
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
)
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.db.session import entity_context, require_entity_context

#: Ordered worst-first, so a long report still leads with what matters.
SEVERITIES = ("critical", "high", "medium", "low")


@dataclass(frozen=True, slots=True)
class Finding:
    """One thing that does not add up.

    `subject` is what to look at in the app — an invoice number, an entry id.
    A finding you cannot act on is noise.
    """

    check: str
    severity: str
    subject: str
    detail: str


def _posted_entry_ids_missing_or_voided(session: Session, ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """Of the given journal entries, which are voided or gone.

    Done as one query rather than per row: these checks run over whole books,
    and a lookup per invoice would make the report too slow to run often
    enough to matter.
    """
    if not ids:
        return set()
    live = set(
        session.scalars(
            select(JournalEntry.id).where(
                JournalEntry.id.in_(ids),
                JournalEntry.status == JournalEntryStatus.POSTED,
            )
        )
    )
    return set(ids) - live


# --- 0.1 control-account ties -------------------------------------------


def check_control_account_ties(session: Session, entity_id: uuid.UUID) -> list[Finding]:
    """Every subledger total equals its GL control account.

    The broadest check there is: it does not know *how* the books could drift,
    only that they have. A supplier ledger that disagrees with account 2000 by
    a single kuruş means one of the two was written without the other.

    Reuses the existing registry rather than restating the ties, so a
    subledger added later is covered here the day it is registered.
    """
    from app.core.subledger.control_account_tie import (
        CONTROL_ACCOUNT_TIES,
        _gl_balance,
        fx_gl_try_cost_total,
        fx_try_cost_subledger_total,
    )

    findings: list[Finding] = []
    with entity_context(session, entity_id):
        require_entity_context()
        for tie in CONTROL_ACCOUNT_TIES:
            if tie.account_code == "fx_wallets_aggregate":
                subledger = fx_try_cost_subledger_total(session, entity_id)
                gl = fx_gl_try_cost_total(session, entity_id)
            else:
                subledger = tie.balance_fn(session, entity_id)
                gl = _gl_balance(session, entity_id, tie.account_code, tie.normal_side)
            if subledger != gl:
                findings.append(
                    Finding(
                        check="control_account_tie",
                        severity="critical",
                        subject=f"{tie.table_name} → {tie.account_code}",
                        detail=(
                            f"subledger {subledger} vs GL {gl} "
                            f"(out by {subledger - gl} kuruş)"
                        ),
                    )
                )
    return findings


# --- 0.2 drafts claiming to be posted -----------------------------------


def check_drafts_claiming_posted(session: Session, entity_id: uuid.UUID) -> list[Finding]:
    """An invoice draft saying `posted` whose entry is voided or absent.

    Exactly the state that was reported as "i voided it but i can still see
    the invoice in review invoices". `status` is what every screen reads, so a
    stale one means the invoice shows as booked, still offers Edit and Void,
    and blocks the same file being uploaded again — while its money is out of
    the ledger.
    """
    from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus

    findings: list[Finding] = []
    with entity_context(session, entity_id):
        require_entity_context()
        rows = list(
            session.execute(
                select(
                    InvoiceDraft.id,
                    InvoiceDraft.invoice_number,
                    InvoiceDraft.journal_entry_id,
                ).where(InvoiceDraft.status == InvoiceDraftStatus.POSTED.value)
            ).all()
        )
        no_entry = [r for r in rows if r.journal_entry_id is None]
        dead = _posted_entry_ids_missing_or_voided(
            session, [r.journal_entry_id for r in rows if r.journal_entry_id]
        )

    for row in no_entry:
        findings.append(
            Finding(
                check="draft_posted_without_entry",
                severity="high",
                subject=f"invoice {row.invoice_number}",
                detail="draft says posted but carries no journal entry",
            )
        )
    for row in rows:
        if row.journal_entry_id in dead:
            findings.append(
                Finding(
                    check="draft_posted_entry_voided",
                    severity="high",
                    subject=f"invoice {row.invoice_number}",
                    detail=(
                        "draft says posted but its journal entry is voided or "
                        f"missing ({row.journal_entry_id})"
                    ),
                )
            )
    return findings


# --- 0.3 statement lines claiming to be posted --------------------------


def check_statement_lines_claiming_posted(
    session: Session, entity_id: uuid.UUID
) -> list[Finding]:
    """A bank line reading LINKED/POSTED whose entry is voided or gone.

    `reset_statement_lines_for_voided_journal` exists for this and is called
    from one place only, so voiding through any other route leaves the line
    claiming to be reconciled. **The bank import then looks reconciled when it
    is not**, and the line cannot be classified again.
    """
    from app.features.banking.statement_models import (
        BankStatementLine,
        StatementLineStatus,
    )

    findings: list[Finding] = []
    resolved = (StatementLineStatus.POSTED.value, StatementLineStatus.LINKED.value)
    with entity_context(session, entity_id):
        require_entity_context()
        rows = list(
            session.execute(
                select(
                    BankStatementLine.id,
                    BankStatementLine.description,
                    BankStatementLine.journal_entry_id,
                    BankStatementLine.status,
                ).where(
                    BankStatementLine.status.in_(resolved),
                    BankStatementLine.journal_entry_id.is_not(None),
                )
            ).all()
        )
        dead = _posted_entry_ids_missing_or_voided(
            session, [r.journal_entry_id for r in rows]
        )

    for row in rows:
        if row.journal_entry_id in dead:
            findings.append(
                Finding(
                    check="statement_line_entry_voided",
                    severity="high",
                    subject=f"bank line {(row.description or '')[:48]}",
                    detail=(
                        f"line says {row.status} but its journal entry is "
                        f"voided or missing ({row.journal_entry_id}) — the "
                        "import looks reconciled and the line cannot be reused"
                    ),
                )
            )
    return findings


# --- 0.4 entries dated in the future ------------------------------------


def check_future_dated_entries(
    session: Session, entity_id: uuid.UUID, *, today: date | None = None
) -> list[Finding]:
    """A posted entry dated after today.

    Suppliers do not issue invoices before they exist, so this is a misread
    date — and it is the misread that hides itself: the amount is right, so
    nothing looks wrong, while every screen that could show it is filtered by
    date. One reached the books dated six weeks out.
    """
    cutoff = today or date.today()
    findings: list[Finding] = []
    with entity_context(session, entity_id):
        require_entity_context()
        rows = list(
            session.execute(
                select(
                    JournalEntry.id, JournalEntry.entry_date, JournalEntry.description
                ).where(
                    JournalEntry.status == JournalEntryStatus.POSTED,
                    JournalEntry.entry_date > cutoff,
                )
            ).all()
        )
    for row in rows:
        findings.append(
            Finding(
                check="future_dated_entry",
                severity="high",
                subject=row.description or str(row.id),
                detail=f"dated {row.entry_date.isoformat()}, after today ({cutoff})",
            )
        )
    return findings


# --- 0.5 unbalanced entries ---------------------------------------------


def check_unbalanced_entries(session: Session, entity_id: uuid.UUID) -> list[Finding]:
    """Debits equal credits on every entry.

    The one that must never happen. Posting enforces it, so a finding here
    means something wrote to the ledger without going through the posting
    boundary — which is rule 10, and worth stopping everything for.
    """
    findings: list[Finding] = []
    # Grouped by (entry, side) and summed in Python rather than a conditional
    # sum in SQL: two short queries' worth of rows, and the arithmetic is
    # readable by anyone checking whether the check itself is right.
    with entity_context(session, entity_id):
        require_entity_context()
        rows = list(
            session.execute(
                select(
                    JournalEntryLine.journal_entry_id,
                    JournalEntryLine.side,
                    func.sum(JournalEntryLine.amount_kurus),
                )
                .join(
                    JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id
                )
                .group_by(JournalEntryLine.journal_entry_id, JournalEntryLine.side)
            ).all()
        )

    totals: dict[uuid.UUID, dict[str, int]] = {}
    for entry_id, side, total in rows:
        bucket = totals.setdefault(entry_id, {"debit": 0, "credit": 0})
        key = "debit" if side == AccountNormalBalance.DEBIT else "credit"
        bucket[key] += int(total or 0)

    for entry_id, sides in totals.items():
        if sides["debit"] != sides["credit"]:
            findings.append(
                Finding(
                    check="unbalanced_entry",
                    severity="critical",
                    subject=str(entry_id),
                    detail=(
                        f"debits {sides['debit']} vs credits {sides['credit']} "
                        f"(out by {sides['debit'] - sides['credit']} kuruş)"
                    ),
                )
            )
    return findings


# --- 0.6 posted invoices whose VAT was assumed --------------------------


def check_assumed_vat_posted(session: Session, entity_id: uuid.UUID) -> list[Finding]:
    """A posted invoice whose per-rate KDV could not be read.

    When the tax table cannot be parsed the reader assumes a single line
    covering everything between net and gross. On a telecom invoice that swept
    a communication tax and a licence fee into reclaimable VAT — 585,75 where
    the document said 185,83. These reach a KDV return, so each one wants a
    human eye even though nothing is technically broken.
    """
    from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus

    findings: list[Finding] = []
    with entity_context(session, entity_id):
        require_entity_context()
        rows = list(
            session.execute(
                select(
                    InvoiceDraft.invoice_number,
                    InvoiceDraft.supplier_name,
                    InvoiceDraft.gross_kurus,
                    InvoiceDraft.extraction_payload,
                ).where(InvoiceDraft.status == InvoiceDraftStatus.POSTED.value)
            ).all()
        )
    for row in rows:
        raw = (row.extraction_payload or {}).get("raw")
        if isinstance(raw, dict) and raw.get("assumed_vat"):
            findings.append(
                Finding(
                    check="assumed_vat_posted",
                    severity="medium",
                    subject=f"invoice {row.invoice_number} ({row.supplier_name})",
                    detail=(
                        "VAT was assumed, not read from the document — check "
                        "the reclaimable KDV against the paper"
                    ),
                )
            )
    return findings


# --- 0.7 subledger rows pointing at nothing -----------------------------


def check_orphaned_subledger_rows(
    session: Session, entity_id: uuid.UUID
) -> list[Finding]:
    """A subledger row whose journal entry does not exist.

    Money recorded against a customer or supplier with nothing behind it in
    the ledger. Foreign keys should prevent it; this checks rather than
    assumes, because the row is invisible from both directions if it happens.
    """
    from app.core.fx.models import FxLedgerEntry
    from app.core.partners.models import PartnerLedgerEntry
    from app.core.payables.models import SupplierLedgerEntry
    from app.core.receivables.models import CustomerLedgerEntry
    from app.core.staff.models import StaffLedgerEntry

    tables = {
        "supplier_ledger_entries": SupplierLedgerEntry,
        "customer_ledger_entries": CustomerLedgerEntry,
        "staff_ledger_entries": StaffLedgerEntry,
        "partner_ledger_entries": PartnerLedgerEntry,
        "fx_ledger_entries": FxLedgerEntry,
    }
    findings: list[Finding] = []
    with entity_context(session, entity_id):
        require_entity_context()
        for name, model in tables.items():
            missing = list(
                session.scalars(
                    select(model.id)
                    .outerjoin(
                        JournalEntry, JournalEntry.id == model.journal_entry_id
                    )
                    .where(
                        model.journal_entry_id.is_not(None),
                        JournalEntry.id.is_(None),
                    )
                )
            )
            for row_id in missing:
                findings.append(
                    Finding(
                        check="orphaned_subledger_row",
                        severity="critical",
                        subject=f"{name} {row_id}",
                        detail="row points at a journal entry that does not exist",
                    )
                )
    return findings


# --- the run ------------------------------------------------------------

CHECKS = (
    check_control_account_ties,
    check_drafts_claiming_posted,
    check_statement_lines_claiming_posted,
    check_future_dated_entries,
    check_unbalanced_entries,
    check_assumed_vat_posted,
    check_orphaned_subledger_rows,
)


def run_books_health(session: Session, entity_id: uuid.UUID) -> list[Finding]:
    """Every check against one entity's books, worst first.

    A check that raises is reported rather than allowed to end the run: a
    broken check must not hide the six that work, and "this check itself
    failed" is a finding worth seeing.
    """
    findings: list[Finding] = []
    for check in CHECKS:
        try:
            findings.extend(check(session, entity_id))
        except Exception as exc:  # noqa: BLE001 - a broken check is a finding
            findings.append(
                Finding(
                    check=check.__name__,
                    severity="high",
                    subject="(the check itself)",
                    detail=f"{type(exc).__name__}: {exc}",
                )
            )
    order = {name: i for i, name in enumerate(SEVERITIES)}
    return sorted(findings, key=lambda f: (order.get(f.severity, 99), f.check))
