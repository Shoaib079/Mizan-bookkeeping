"""Which poster runs for each statement line classification.

`classify_statement_line` was a flat chain of twenty-two
`if classification == …` blocks, read top to bottom to find the one that
applied. A classification with no block fell out of the bottom into the
transfer handling, which then decided it was not a transfer and raised
something unrelated to what was actually wrong.

A table cannot fall through. It can be incomplete, so
`test_classification_poster_table.py` compares it against the enum — every
classification has a poster here or a stated reason for having none.

The posters are grouped by what they touch rather than split for size:
payments settle a record that already exists, expenses have no counterparty
ledger, staff and partners each write their own id onto the line, loans are
the bank's own. Reading one group answers a question about that corner of the
books without the other four in the way.
"""

from __future__ import annotations

from collections.abc import Callable

from app.features.banking.schema import ClassifyStatementLineResult
from app.features.banking.statement_classify_core import _ClassifyContext
from app.features.banking.statement_models import StatementLineClassification
from app.features.banking.statement_posters.expenses import (
    _post_bank_fee,
    _post_other_income,
    _post_pos_commission,
    _post_rent_utility,
    _post_store_purchase,
)
from app.features.banking.statement_posters.loans import (
    _post_loan_payment,
    _post_loan_receipt,
)
from app.features.banking.statement_posters.partners import (
    _post_partner_capital_contribution,
    _post_partner_drawing,
    _post_partner_drawing_repayment,
    _post_partner_loan_payment,
    _post_partner_loan_receipt,
    _post_partner_profit_paid,
    _post_partner_reimbursement,
)
from app.features.banking.statement_posters.payments import (
    _post_credit_card_payment,
    _post_customer_payment,
    _post_delivery_settlement,
    _post_pos_settlement,
    _post_supplier_payment,
)
from app.features.banking.statement_posters.staff import (
    _post_staff_advance,
    _post_staff_incentive,
    _post_staff_payment,
)

#: TRANSFER is deliberately absent: it is not a posting, it is a pairing of two
#: statement lines, and it is matched and linked after this dispatch.
CLASSIFICATION_POSTERS: dict[
    StatementLineClassification,
    Callable[[_ClassifyContext], ClassifyStatementLineResult],
] = {
    StatementLineClassification.SUPPLIER_PAYMENT: _post_supplier_payment,
    StatementLineClassification.CUSTOMER_PAYMENT: _post_customer_payment,
    StatementLineClassification.POS_SETTLEMENT: _post_pos_settlement,
    StatementLineClassification.DELIVERY_SETTLEMENT: _post_delivery_settlement,
    StatementLineClassification.BANK_FEE: _post_bank_fee,
    StatementLineClassification.POS_COMMISSION: _post_pos_commission,
    StatementLineClassification.CREDIT_CARD_PAYMENT: _post_credit_card_payment,
    StatementLineClassification.OTHER_INCOME: _post_other_income,
    StatementLineClassification.RENT_UTILITY: _post_rent_utility,
    StatementLineClassification.STORE_PURCHASE: _post_store_purchase,
    StatementLineClassification.STAFF_PAYMENT: _post_staff_payment,
    StatementLineClassification.STAFF_INCENTIVE: _post_staff_incentive,
    StatementLineClassification.STAFF_ADVANCE: _post_staff_advance,
    StatementLineClassification.PARTNER_DRAWING: _post_partner_drawing,
    StatementLineClassification.PARTNER_REIMBURSEMENT: _post_partner_reimbursement,
    StatementLineClassification.PARTNER_DRAWING_REPAYMENT: _post_partner_drawing_repayment,
    StatementLineClassification.PARTNER_CAPITAL_CONTRIBUTION: _post_partner_capital_contribution,
    StatementLineClassification.PARTNER_PROFIT_PAID: _post_partner_profit_paid,
    StatementLineClassification.PARTNER_LOAN_RECEIPT: _post_partner_loan_receipt,
    StatementLineClassification.PARTNER_LOAN_PAYMENT: _post_partner_loan_payment,
    StatementLineClassification.LOAN_PAYMENT: _post_loan_payment,
    StatementLineClassification.LOAN_RECEIPT: _post_loan_receipt,
}
