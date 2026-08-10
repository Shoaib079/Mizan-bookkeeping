"""Subledger-safe journal entry corrections.

This was one 2,427-line file. It is now a package, and this module is the
front door: every name the rest of the app imported from `correction` is
re-exported here, so nothing outside had to change. Thirty-nine names across
thirty-seven files, and `tests/test_correction_surface.py` holds every one of
them — including parameter names and order, because most of these take
`actor_id`, `reason` and `void_date` as adjacent keyword-only optionals, and a
careless reorder during a move still imports, still runs, and dates a reversal
wrong.

Where things went:

  registry    which sources may be corrected, and how
  machinery   the shared runners every flow reaches the ledger through
  drafts      handing an invoice draft back when its posting is undone
  suppliers   invoices, payments, credit notes
  customers   credit sales and payments
  write_offs  deciding a receivable will not be paid
  fx          purchases, conversions, spend
  invoices    delivery platform commission
  staff       accruals, advances, payments
  partners    partner ledger movements
  expenses    hand-recorded expenses
  pos         a day's point-of-sale summary

The layering has one direction: registry ← machinery ← domains ← here.
Nothing in machinery knows which domain it is serving, which is what keeps
the package free of cycles.

Several private helpers are re-exported because callers outside reached for
them when there was nowhere else to put them. Narrowing that is worth doing —
deliberately, in its own commit, not while code is in motion.
"""

from app.core.ledger.correction.customers import (
    correct_credit_sale,
    correct_customer_payment,
    void_credit_sale,
    void_customer_payment,
)
from app.core.ledger.correction.drafts import (
    _delivery_commission_draft,
    _draft_for_journal_entry,
    _release_posted_draft,
)
from app.core.ledger.correction.expenses import (
    correct_expense_entry,
    void_expense_entry,
)
from app.core.ledger.correction.fx import (
    _get_cash_movement_for_journal,
    correct_fx_conversion_or_spend,
    correct_fx_purchase,
    void_fx_conversion_or_spend,
    void_fx_purchase,
)
from app.core.ledger.correction.invoices import (
    correct_delivery_commission_invoice,
    void_delivery_commission_invoice,
)
from app.core.ledger.correction.machinery import (
    SubledgerCorrectionResult,
    SubledgerVoidResult,
    _append_cash_movement_reversal,
    _append_customer_reversal,
    _append_fx_reversal,
    _append_partner_reversal,
    _append_staff_reversal,
    _append_supplier_reversal,
    _effective_void_date,
    _get_customer_ledger_row,
    _get_fx_ledger_row,
    _get_supplier_ledger_row,
    _run_subledger_correction,
    _run_subledger_correction_with_setup,
    _run_subledger_void,
    _void_journal_entry_in_transaction,
    correct_gl_with_subledger_rows,
    void_gl_with_subledger_rows,
)
from app.core.ledger.correction.partners import (
    correct_partner_journal_entry,
    void_partner_journal_entry,
)
from app.core.ledger.correction.pos import (
    PosDailySummaryCorrectionError,
    correct_pos_daily_summary,
    void_pos_daily_summary,
)
from app.core.ledger.correction.registry import (
    CorrectionNotFoundError,
    DEDICATED_CORRECTION_ROUTES,
    GENERIC_CORRECTABLE_SOURCES,
    SubledgerBackedCorrectionError,
    VOID_AND_REENTER_SOURCES,
    is_generic_correctable,
    resolve_correction_route,
    verify_correction_source_registry_complete,
)
from app.core.ledger.correction.staff import (
    correct_staff_journal_entry,
    void_staff_journal_entry,
)
from app.core.ledger.correction.suppliers import (
    correct_supplier_invoice,
    correct_supplier_payment,
    void_supplier_credit_note,
    void_supplier_invoice,
    void_supplier_payment,
)
from app.core.ledger.correction.write_offs import (
    correct_customer_write_off,
    void_customer_write_off,
)
