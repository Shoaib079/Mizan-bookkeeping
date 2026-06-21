# PROGRESS

## Current

| Field | Value |
|-------|-------|
| **Phase** | 4 — POS settlement + credit cards |
| **Last completed slice** | Credit card payment + bank fee GL posting |
| **Next slice** | Phase 4 owner sign-off |
| **Branch** | `main` |
| **Last tag** | `v0.25.0-phase4-cc-payment-bank-fee-gl` (pending commit) |

## Resume point

Phase 4 all slices done pending owner sign-off. **Credit card payment + bank fee GL** — `credit_card_payment` classification posts Dr CC payable / Cr bank (liability reduction, not expense); `bank_fee` posts Dr `5300` / Cr bank. POS settlement slices 1–3 previously signed off by owner.

## Session notes

- **Credit card payment + bank fee GL:** `StatementLineClassification.CREDIT_CARD_PAYMENT`; `post_credit_card_payment()` + `post_bank_fee()` in `core/banking/statement_posting.py`; `credit_card_payments` table; statement classify links `credit_card_payment_id`; Alembic `022`
- **Card sales reconciliation:** `card_sales_batches` table; settlement commission; clearing reconciliation API; Alembic `021`
- **Credit card clearing accounts:** `MoneyAccountKind.CREDIT_CARD` under `2100`; tree API; Alembic `020`
- **POS settlement intake:** `post_pos_settlement()` Dr bank / Cr `1400`; Alembic `019`
- **215 pytest** green (expected after slice)
