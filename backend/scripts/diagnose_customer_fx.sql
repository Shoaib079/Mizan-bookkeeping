-- Is there anything to test the FX outstanding against?
--
-- The customer page and the Record payment popup now show what a customer owes
-- in the currency they agreed to pay in, alongside the TRY book balance. That
-- only appears when a customer has an unsettled forex-denominated sale, so this
-- answers whether any exist yet — and if so, which customer to open.
--
-- Movement types are compared in UPPERCASE on purpose. customer_ledger_entries
-- uses Enum(native_enum=False), which stores the enum NAME ('CREDIT_SALE'),
-- not its value ('credit_sale'). Comparing to lowercase matches nothing and
-- reports a clean bill of health on a customer who owes thousands — which is
-- exactly what the balance sheet diagnostic did the first time. Note that
-- invoice_drafts.status is the opposite: a plain String column holding the
-- lowercase value.
--
-- Run from the backend/ directory:
--   psql -h localhost -d mizan -f scripts/diagnose_customer_fx.sql

\echo '=== 1. Customers on file ==='
SELECT e.name AS entity, count(*) AS customers
FROM customers c JOIN entities e ON e.id = c.entity_id
GROUP BY e.name ORDER BY e.name;

\echo ''
\echo '=== 2. Group sales, by booking currency ==='
\echo '(A row with forex_currency set is what the new display needs. A TRY-only'
\echo ' book means there is nothing yet to see it with.)'
SELECT
  e.name AS entity,
  g.currency,
  g.forex_currency,
  g.status,
  count(*) AS sales,
  sum(g.total_forex_minor) / 100.0 AS native_total,
  sum(g.total_kurus) / 100.0 AS try_total
FROM group_sales g JOIN entities e ON e.id = g.entity_id
GROUP BY e.name, g.currency, g.forex_currency, g.status
ORDER BY e.name, g.currency, g.forex_currency;

\echo ''
\echo '=== 3. The forex receivable movements the new code reads ==='
\echo '(outstanding_by_currency sums CREDIT_SALE + DISCOUNT minus PAYMENT_RECEIVED'
\echo ' per currency. Empty here means the page will correctly show nothing.)'
SELECT
  forex_currency,
  movement_type,
  -- Split out because a CREDIT_SALE row with amount_kurus <= 0 is a reversal,
  -- and the app excludes those from the outstanding figure.
  (amount_kurus > 0) AS positive_try,
  count(*) AS entries,
  sum(total_forex_minor) / 100.0 AS forex_total,
  sum(payment_native_quantity) / 100.0 AS forex_paid
FROM customer_ledger_entries
WHERE forex_currency IS NOT NULL
GROUP BY forex_currency, movement_type, (amount_kurus > 0)
ORDER BY forex_currency, movement_type;

\echo ''
\echo '=== 4. Which customer to open, and what the page should say ==='
\echo '(Open this customer: the headline should read "Owed: <native>" under the'
\echo ' lira balance, and the Record payment popup should agree.)'
--
-- This mirrors native_balance_for_currency() line for line, deliberately:
--
--   sales     CREDIT_SALE, and only where amount_kurus > 0. A reversed or
--             corrected sale leaves a non-positive row behind; the app skips
--             it, so a re-derivation without this filter would print a figure
--             the page never shows and send you hunting a bug that is not one.
--   discounts DISCOUNT rows store a NEGATIVE total_forex_minor, so they are
--             added, not subtracted.
--   payments  PAYMENT_RECEIVED, summed on payment_native_quantity — the amount
--             actually handed over, not the lira it was carried at.
--
-- A settled currency nets to zero and is dropped by the HAVING, which is the
-- same thing outstanding_by_currency() does before returning.
WITH balance AS (
  SELECT
    cle.customer_id,
    cle.forex_currency,
    COALESCE(SUM(cle.total_forex_minor) FILTER (
      WHERE cle.movement_type = 'CREDIT_SALE' AND cle.amount_kurus > 0
    ), 0)
    + COALESCE(SUM(cle.total_forex_minor) FILTER (
      WHERE cle.movement_type = 'DISCOUNT'
    ), 0)
    - COALESCE(SUM(cle.payment_native_quantity) FILTER (
      WHERE cle.movement_type = 'PAYMENT_RECEIVED'
    ), 0) AS still_owed_minor
  FROM customer_ledger_entries cle
  WHERE cle.forex_currency IS NOT NULL
  GROUP BY cle.customer_id, cle.forex_currency
)
SELECT
  e.name AS entity,
  c.name AS customer,
  b.forex_currency AS currency,
  b.still_owed_minor / 100.0 AS still_owed_native
FROM balance b
JOIN customers c ON c.id = b.customer_id
JOIN entities e ON e.id = c.entity_id
WHERE b.still_owed_minor <> 0
ORDER BY e.name, c.name, b.forex_currency;
