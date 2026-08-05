-- Is there any invoice data here at all, and what dates does it carry?
--
-- Run this when diagnose_kdv.sql returns zero rows for a period. Section 1 of
-- that script has no status filter, so an empty result means no invoice exists
-- with an invoice_date in the range — which is a different question from
-- "why is this invoice's KDV missing".
--
-- Run:  psql -h localhost -d mizan -f backend/scripts/diagnose_kdv_scope.sql

\echo '=== Which database am I actually connected to? ==='
SELECT current_database(), current_user, inet_server_addr() AS host;

\echo ''
\echo '=== Entities in this database ==='
\echo '(If this is empty or unfamiliar, the books you are looking for are elsewhere —'
\echo ' most likely the deployed Railway database rather than localhost.)'
SELECT id, name FROM entities ORDER BY name;

\echo ''
\echo '=== Every invoice draft, by entity and status ==='
\echo '(No date filter at all. Zero rows here means no invoices have been uploaded'
\echo ' into THIS database, whatever the app is showing you.)'
SELECT
  e.name AS entity,
  d.status,
  count(*) AS invoices,
  min(d.invoice_date) AS earliest,
  max(d.invoice_date) AS latest
FROM invoice_drafts d
JOIN entities e ON e.id = d.entity_id
GROUP BY e.name, d.status
ORDER BY e.name, d.status;

\echo ''
\echo '=== Invoice count by month ==='
\echo '(Shows which periods actually hold invoices, so you can re-run'
\echo ' diagnose_kdv.sql against a month that has some.)'
SELECT
  to_char(d.invoice_date, 'YYYY-MM') AS month,
  count(*) AS invoices,
  count(*) FILTER (WHERE d.status = 'posted') AS posted,
  COALESCE(sum((
    SELECT sum((v ->> 'vat_kurus')::bigint)
    FROM jsonb_array_elements(d.vat_breakdown) v
  )), 0) / 100.0 AS kdv_try
FROM invoice_drafts d
GROUP BY to_char(d.invoice_date, 'YYYY-MM')
ORDER BY month;

\echo ''
\echo '=== Row counts, in case RLS is hiding things ==='
\echo '(These tables are entity-scoped. A privileged psql session normally sees'
\echo ' everything; if these counts are non-zero but the joins above were empty,'
\echo ' row-level security is filtering and the app is the better place to look.)'
SELECT
  (SELECT count(*) FROM invoice_drafts) AS invoice_drafts,
  (SELECT count(*) FROM journal_entries) AS journal_entries,
  (SELECT count(*) FROM entities) AS entities;
