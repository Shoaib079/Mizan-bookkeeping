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

    `retarget_statement_lines_for_journal` now runs inside the void and
    correct funnels, so new occurrences should not appear. This check stays
    for the ones already in the books from when it was called from a single
    call site out of six, and because a seventh void path added later would
    show up here before anyone noticed the bank import claiming to be
    reconciled against money that is no longer in the ledger.
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


def unbalanced_findings(totals: dict[uuid.UUID, dict[str, int]]) -> list[Finding]:
    """The arithmetic, separated from the query so it can be tested.

    It has to be separated, because **the state this looks for cannot be
    created through the database.** `journal_entry_lines` carries an
    immutability trigger — no UPDATE at all — and posting refuses to write an
    unbalanced entry in the first place. Trying to build the fault in a test
    raises `ImmutableJournalError`, which is the database doing its job.

    That is an argument for keeping the check, not dropping it. Two guards
    stand between the books and an unbalanced entry, and both live in code a
    migration can change. This one is the cheapest, and it is the only one
    that would notice if the other two were ever relaxed.
    """
    findings: list[Finding] = []
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


def check_unbalanced_entries(session: Session, entity_id: uuid.UUID) -> list[Finding]:
    """Debits equal credits on every entry.

    The one that must never happen. Posting enforces it and the line table is
    immutable, so a finding here means something reached the ledger without
    going through the posting boundary — rule 10 — and is worth stopping
    everything for.
    """
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

    return unbalanced_findings(totals)


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


@dataclass(frozen=True, slots=True)
class AccountEntry:
    """One journal line on an account, named so a person can recognise it."""

    entry_date: date
    source: str
    description: str
    signed_kurus: int


def account_entries(
    session: Session,
    entity_id: uuid.UUID,
    account_code: str,
    *,
    sources: set[str] | None = None,
    limit: int = 50,
) -> list[AccountEntry]:
    """The individual lines behind a total, newest first.

    A breakdown by movement type says *what kind* of thing is on an account.
    It cannot say when it got there or who put it, and that is the question
    that decides whether a mismatch is a check measuring the wrong thing or
    the books actually holding something they should not.

    Spice Corner is the case that asked for this: a partner drawing sitting
    on the reimbursement payable, when all three code paths that post a
    drawing send it to owner drawings instead. Totals cannot tell you whether
    that is a live bug or a scar from an older version — a date does.

    `sources` narrows to the ones worth reading, because on a busy account
    the answer is usually one odd source among several ordinary ones.
    """
    from app.core.chart_of_accounts.models import Account
    from app.core.ledger.balances import live_entry_clauses
    from app.core.ledger.models import JournalEntryLine

    with entity_context(session, entity_id):
        require_entity_context()
        account_id = session.scalar(
            select(Account.id).where(Account.code == account_code)
        )
        if account_id is None:
            return []

        query = (
            select(
                JournalEntry.entry_date,
                JournalEntry.source,
                JournalEntry.description,
                JournalEntryLine.side,
                JournalEntryLine.amount_kurus,
            )
            .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
            .where(
                JournalEntryLine.account_id == account_id,
                *live_entry_clauses(),
            )
            .order_by(JournalEntry.entry_date.desc())
            .limit(limit)
        )

        rows = []
        for entry_date, source, description, side, amount in session.execute(query):
            name = source.value if hasattr(source, "value") else str(source)
            if sources is not None and name not in sources:
                continue
            signed = int(amount or 0)
            if side == AccountNormalBalance.DEBIT:
                signed = -signed
            rows.append(
                AccountEntry(
                    entry_date=entry_date,
                    source=name,
                    description=description or "",
                    signed_kurus=signed,
                )
            )
        return rows


def explain_account(
    session: Session, entity_id: uuid.UUID, account_code: str
) -> tuple[list[tuple[str, int]], list[tuple[str, int]]]:
    """Both sides of one control-account tie, so a mismatch can be read.

    Returns `(subledger by movement type, GL by journal source)`. A tie
    failure says only that two numbers differ; the useful question is *which
    movements one side counts and the other does not*, and that is a
    breakdown, not a total.

    Written because the first real run produced a tie mismatch of 220.000 TL
    and the honest next step was neither "the books are broken" nor "the
    check is broken" but "show me the movements".
    """
    from app.core.chart_of_accounts.models import Account
    from app.core.ledger.balances import live_entry_clauses
    from app.core.ledger.models import JournalEntryLine
    from app.core.partners.models import PartnerLedgerEntry

    with entity_context(session, entity_id):
        require_entity_context()
        by_movement = [
            (str(row[0].value if hasattr(row[0], "value") else row[0]), int(row[1] or 0))
            for row in session.execute(
                select(
                    PartnerLedgerEntry.movement_type,
                    func.sum(PartnerLedgerEntry.amount_kurus),
                ).group_by(PartnerLedgerEntry.movement_type)
            ).all()
        ]

        account_id = session.scalar(
            select(Account.id).where(Account.code == account_code)
        )
        by_source: list[tuple[str, int]] = []
        if account_id is not None:
            for source, side, total in session.execute(
                select(
                    JournalEntry.source,
                    JournalEntryLine.side,
                    func.sum(JournalEntryLine.amount_kurus),
                )
                .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
                .where(
                    JournalEntryLine.account_id == account_id,
                    # Not `status == POSTED` alone. This groups by side and
                    # signs the total itself, so a void's reversal survives
                    # while the original it cancels does not — the account
                    # then appears short by the voided amount. See
                    # `live_entry_clauses` for why the pair is inseparable.
                    *live_entry_clauses(),
                )
                .group_by(JournalEntry.source, JournalEntryLine.side)
            ).all():
                name = source.value if hasattr(source, "value") else str(source)
                signed = int(total or 0)
                side_name = "debit" if side == AccountNormalBalance.DEBIT else "credit"
                if side == AccountNormalBalance.DEBIT:
                    signed = -signed
                by_source.append((f"{name} ({side_name})", signed))

    return sorted(by_movement, key=lambda r: -abs(r[1])), sorted(
        by_source, key=lambda r: -abs(r[1])
    )


def order_findings(findings: list[Finding]) -> list[Finding]:
    """Worst first, then by check so a report is stable between runs.

    Stability matters more than it looks: the plan calls for taking a report
    before a refactor and after, and comparing them. Two runs that differ only
    in ordering would make that comparison useless.
    """
    order = {name: i for i, name in enumerate(SEVERITIES)}
    return sorted(findings, key=lambda f: (order.get(f.severity, 99), f.check))


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
    return order_findings(findings)
