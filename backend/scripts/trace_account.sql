-- Every posting that built an account's balance.
--
-- For when a figure on a statement looks wrong and you need to know where it
-- came from — which entries, from which part of the app, on which dates.
--
-- Run (account code is required):
--   psql -h localhost -d mizan -v code=3900 -f backend/scripts/trace_account.sql
--
-- Reads only. Counts the same postings the reports do: status posted, and not
-- a reversal. Comparisons are lower()ed because SQLAlchemy stores enum NAMES.

\echo '=== Balance by entity ==='
SELECT
  e.name AS entity,
  a.code,
  a.name_en,
  a.normal_balance,
  SUM(
    CASE WHEN lower(l.side) = lower(a.normal_balance)
         THEN l.amount_kurus ELSE -l.amount_kurus END
  ) AS balance_kurus
FROM journal_entry_lines l
JOIN journal_entries je ON je.id = l.journal_entry_id
JOIN accounts a ON a.id = l.account_id
JOIN entities e ON e.id = a.entity_id
WHERE a.code = :'code'
  AND lower(je.status) = 'posted'
  AND je.reverses_entry_id IS NULL
GROUP BY e.name, a.code, a.name_en, a.normal_balance
ORDER BY e.name;

\echo ''
\echo '=== Where it came from ==='
SELECT
  e.name AS entity,
  je.source,
  count(DISTINCT je.id) AS entries,
  min(je.entry_date) AS first_entry,
  max(je.entry_date) AS last_entry,
  SUM(
    CASE WHEN lower(l.side) = lower(a.normal_balance)
         THEN l.amount_kurus ELSE -l.amount_kurus END
  ) AS net_kurus
FROM journal_entry_lines l
JOIN journal_entries je ON je.id = l.journal_entry_id
JOIN accounts a ON a.id = l.account_id
JOIN entities e ON e.id = a.entity_id
WHERE a.code = :'code'
  AND lower(je.status) = 'posted'
  AND je.reverses_entry_id IS NULL
GROUP BY e.name, je.source
ORDER BY e.name, abs(SUM(
    CASE WHEN lower(l.side) = lower(a.normal_balance)
         THEN l.amount_kurus ELSE -l.amount_kurus END
  )) DESC;

\echo ''
\echo '=== The twenty largest individual postings ==='
SELECT
  e.name AS entity,
  je.entry_date,
  je.source,
  left(je.description, 60) AS description,
  l.side,
  l.amount_kurus
FROM journal_entry_lines l
JOIN journal_entries je ON je.id = l.journal_entry_id
JOIN accounts a ON a.id = l.account_id
JOIN entities e ON e.id = a.entity_id
WHERE a.code = :'code'
  AND lower(je.status) = 'posted'
  AND je.reverses_entry_id IS NULL
ORDER BY l.amount_kurus DESC
LIMIT 20;
