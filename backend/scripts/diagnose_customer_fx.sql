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
-- Run:  psql -h localhost -d mizan -f backend/scripts/diagnose_customer_fx.sql

\echo '=== 1. Customers on file ==='
SELECT e.name AS entity, count(*) AS customers
FROM customers c JOIN entities e ON e.id = c.entity_id
GROUP BY e.name ORDER BY e.name;

\echo ''
\echo '=== 2. Group sales, by booking currency ==='
\echo '(A row with currency other than TRY is what the new display needs.)'
SELECT
  e.name AS entity,
  g.currency,
  count(*) AS sales,
  sum(g.total_minor) / 100.0 AS native_total,
  sum(g.total_kurus) / 100.0 AS try_total
FROM group_sales g JOIN entities e ON e.id = g.entity_id
GROUP BY e.name, g.currency
ORDER BY e.name, g.currency;

\echo ''
\echo '=== 3. The forex receivable movements the new code reads ==='
\echo '(outstanding_by_currency sums CREDIT_SALE + DISCOUNT minus PAYMENT_RECEIVED'
\echo ' per currency. Empty here means the page will correctly show nothing.)'
SELECT
  forex_currency,
  movement_type,
  count(*) AS entries,
  sum(total_forex_minor) / 100.0 AS forex_total,
  sum(payment_native_quantity) / 100.0 AS forex_paid
FROM customer_ledger_entries
WHERE forex_currency IS NOT NULL
GROUP BY forex_currency, movement_type
ORDER BY forex_currency, movement_type;

\echo ''
\echo '=== 4. Which customer to open, and what the page should say ==='
\echo '(Open this customer: the headline should read "Owed: <native>" under the'
\echo ' lira balance, and the Record payment popup should agree.)'
SELECT
  e.name AS entity,
  c.name AS customer,
  cle.forex_currency AS currency,
  (
    COALESCE(SUM(cle.total_forex_minor) FILTER (
      WHERE cle.movement_type IN ('CREDIT_SALE', 'DISCOUNT')
    ), 0)
    - COALESCE(SUM(cle.payment_native_quantity) FILTER (
      WHERE cle.movement_type = 'PAYMENT_RECEIVED'
    ), 0)
  ) / 100.0 AS still_owed_native
FROM customer_ledger_entries cle
JOIN customers c ON c.id = cle.customer_id
JOIN entities e ON e.id = c.entity_id
WHERE cle.forex_currency IS NOT NULL
GROUP BY e.name, c.name, cle.forex_currency
HAVING (
  COALESCE(SUM(cle.total_forex_minor) FILTER (
    WHERE cle.movement_type IN ('CREDIT_SALE', 'DISCOUNT')
  ), 0)
  - COALESCE(SUM(cle.payment_native_quantity) FILTER (
    WHERE cle.movement_type = 'PAYMENT_RECEIVED'
  ), 0)
) <> 0
ORDER BY e.name, c.name;
