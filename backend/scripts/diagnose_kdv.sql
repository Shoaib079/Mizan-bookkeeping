-- Why is an invoice's KDV missing from the input KDV report?
--
-- The report (app/features/reports/kdv_input.py) counts an invoice only when
-- ALL of these hold:
--   1. status = 'posted'            -- confirmed is NOT enough
--   2. invoice_kind in (supplier, supplier_credit, delivery_commission)
--   3. invoice_date BETWEEN the report's from and to
--   4. vat_breakdown is a non-empty array
--
-- Uploading extracts the KDV and shows it to you immediately, but that is the
-- draft. Nothing reaches the report until the draft is posted to the ledger.
--
-- Note on literals: invoice_drafts.status is a plain String(32) column holding
-- the enum VALUE, so lowercase is correct here. This is NOT true of the ledger
-- enums (journal_entries.status and friends), which store the uppercase enum
-- NAME — comparing those to lowercase silently matches nothing.
--
-- Run:  psql -h localhost -d mizan -f backend/scripts/diagnose_kdv.sql \
--         -v from_date="'2026-06-01'" -v to_date="'2026-06-30'"

\if :{?from_date} \else \set from_date '''2026-06-01''' \endif
\if :{?to_date}   \else \set to_date   '''2026-06-30''' \endif

\echo '=== 1. Invoices in the period, by status ==='
\echo '(Only "posted" reaches the report. Anything else is KDV you can see but the report cannot.)'
SELECT
  e.name AS entity,
  d.status,
  count(*) AS invoices,
  sum(d.gross_kurus) / 100.0 AS gross_try,
  sum(
    COALESCE((
      SELECT sum((v ->> 'vat_kurus')::bigint)
      FROM jsonb_array_elements(d.vat_breakdown) v
    ), 0)
  ) / 100.0 AS kdv_try
FROM invoice_drafts d
JOIN entities e ON e.id = d.entity_id
WHERE d.invoice_date BETWEEN :from_date AND :to_date
GROUP BY e.name, d.status
ORDER BY e.name, d.status;

\echo ''
\echo '=== 2. The specific invoices that are stuck ==='
\echo '(Posted ones are already counted. These are not — this is your missing KDV.)'
SELECT
  e.name AS entity,
  d.invoice_date,
  d.status,
  d.supplier_name,
  d.invoice_number,
  d.gross_kurus / 100.0 AS gross_try,
  COALESCE((
    SELECT sum((v ->> 'vat_kurus')::bigint)
    FROM jsonb_array_elements(d.vat_breakdown) v
  ), 0) / 100.0 AS kdv_try
FROM invoice_drafts d
JOIN entities e ON e.id = d.entity_id
WHERE d.invoice_date BETWEEN :from_date AND :to_date
  AND d.status <> 'posted'
  AND d.status <> 'rejected'
ORDER BY e.name, d.invoice_date, d.supplier_name;

\echo ''
\echo '=== 3. Posted, but carrying no VAT breakdown ==='
\echo '(Counted by the report as zero. Extraction found no KDV lines — check the document.)'
SELECT
  e.name AS entity,
  d.invoice_date,
  d.supplier_name,
  d.invoice_number,
  d.gross_kurus / 100.0 AS gross_try,
  jsonb_array_length(d.vat_breakdown) AS breakdown_rows
FROM invoice_drafts d
JOIN entities e ON e.id = d.entity_id
WHERE d.invoice_date BETWEEN :from_date AND :to_date
  AND d.status = 'posted'
  AND (d.vat_breakdown IS NULL OR jsonb_array_length(d.vat_breakdown) = 0)
ORDER BY e.name, d.invoice_date;

\echo ''
\echo '=== 4. Posted in this period but DATED outside it ==='
\echo '(The report keys on invoice_date, not upload date. A June invoice uploaded'
\echo ' in July belongs to June and will never appear in the July report.)'
SELECT
  e.name AS entity,
  d.invoice_date,
  d.created_at::date AS uploaded_on,
  d.supplier_name,
  COALESCE((
    SELECT sum((v ->> 'vat_kurus')::bigint)
    FROM jsonb_array_elements(d.vat_breakdown) v
  ), 0) / 100.0 AS kdv_try
FROM invoice_drafts d
JOIN entities e ON e.id = d.entity_id
WHERE d.created_at::date BETWEEN :from_date AND :to_date
  AND d.invoice_date NOT BETWEEN :from_date AND :to_date
ORDER BY e.name, d.invoice_date;
