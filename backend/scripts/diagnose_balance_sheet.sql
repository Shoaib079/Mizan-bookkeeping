-- Why does the balance sheet say "Accounting equation check failed"?
--
-- Balances count only journal entries with status='posted' and
-- reverses_entry_id IS NULL, and every account type feeds the sheet (asset,
-- liability, equity directly; revenue and expense via unclosed net income).
-- So the equation can only fail if a counted entry is itself lopsided, or if
-- some of its money lands on an account the report never looks at.
--
-- Run:  psql -h localhost -d mizan -f backend/scripts/diagnose_balance_sheet.sql

\echo '=== 1. Counted entries whose debits do not equal their credits ==='
\echo '(Should be empty. Any row here is a broken entry — note the id and date.)'
SELECT
  je.id,
  je.entry_date,
  je.source,
  je.description,
  SUM(CASE WHEN l.side = 'debit'  THEN l.amount_kurus ELSE 0 END) AS debits,
  SUM(CASE WHEN l.side = 'credit' THEN l.amount_kurus ELSE 0 END) AS credits,
  SUM(CASE WHEN l.side = 'debit'  THEN l.amount_kurus ELSE -l.amount_kurus END)
    AS difference_kurus
FROM journal_entries je
JOIN journal_entry_lines l ON l.journal_entry_id = je.id
WHERE je.status = 'posted'
  AND je.reverses_entry_id IS NULL
GROUP BY je.id, je.entry_date, je.source, je.description
HAVING SUM(CASE WHEN l.side = 'debit' THEN l.amount_kurus ELSE -l.amount_kurus END) <> 0
ORDER BY je.entry_date;

\echo ''
\echo '=== 2. Lines pointing at an account that no longer exists ==='
\echo '(Should be empty. These lines are counted by nothing.)'
SELECT l.id AS line_id, l.journal_entry_id, l.account_id, l.side, l.amount_kurus
FROM journal_entry_lines l
LEFT JOIN accounts a ON a.id = l.account_id
WHERE a.id IS NULL;

\echo ''
\echo '=== 3. Lines whose account belongs to a different restaurant ==='
\echo '(Should be empty. Cross-entity lines are invisible to the report.)'
SELECT je.entity_id AS entry_entity, a.entity_id AS account_entity,
       COUNT(*) AS lines, SUM(l.amount_kurus) AS total_kurus
FROM journal_entry_lines l
JOIN journal_entries je ON je.id = l.journal_entry_id
JOIN accounts a ON a.id = l.account_id
WHERE a.entity_id <> je.entity_id
GROUP BY je.entity_id, a.entity_id;

\echo ''
\echo '=== 4. The equation, rebuilt straight from the ledger ==='
\echo '(assets - (liabilities + equity + net income) should be 0.)'
SELECT
  a.entity_id,
  SUM(CASE WHEN a.account_type = 'asset'
      THEN CASE WHEN l.side = 'debit' THEN l.amount_kurus ELSE -l.amount_kurus END
      ELSE 0 END) AS assets,
  SUM(CASE WHEN a.account_type IN ('liability', 'equity', 'revenue')
      THEN CASE WHEN l.side = 'credit' THEN l.amount_kurus ELSE -l.amount_kurus END
      ELSE 0 END)
  - SUM(CASE WHEN a.account_type = 'expense'
      THEN CASE WHEN l.side = 'debit' THEN l.amount_kurus ELSE -l.amount_kurus END
      ELSE 0 END) AS liabilities_equity_and_result
FROM journal_entry_lines l
JOIN journal_entries je ON je.id = l.journal_entry_id
JOIN accounts a ON a.id = l.account_id
WHERE je.status = 'posted'
  AND je.reverses_entry_id IS NULL
GROUP BY a.entity_id;
