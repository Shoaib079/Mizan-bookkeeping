"use client";

/** Status / supplier / document / ledger / amounts cards for invoice draft review. */

import Link from "next/link";

import { InvoiceDocumentPreview } from "@/components/invoice-document-preview";
import { GlEntryActions } from "@/components/ledger/gl-entry-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { invoiceKindLabel } from "@/lib/invoice-classification";
import { journalEntryLedgerHref } from "@/lib/invoice-draft-list";
import type { InvoiceDraftCapabilities } from "@/lib/invoice-draft-capabilities";
import type { InvoiceDraft } from "@/lib/invoice-draft-types";
import { formatTrDate, formatTry } from "@/lib/money";

type Props = {
  draft: InvoiceDraft;
  caps: InvoiceDraftCapabilities;
  onUpdated?: (outcome?: "removed" | "updated") => void;
};

export function InvoiceDraftSummary({ draft, caps, onUpdated }: Props) {
  const {
    isCommission,
    isCreditNote,
    needsPlatformLink,
    viewOnly,
    invoiceNumberLabel,
    invoiceDateLabel,
    amountsMissing,
  } = caps;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={draft.status} />
        <span
          className={
            isCommission
              ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              : isCreditNote
                ? "rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200"
                : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
          }
        >
          {invoiceKindLabel(draft.invoice_kind)}
        </span>
        <span className="text-sm text-muted-foreground">
          {invoiceNumberLabel} · {invoiceDateLabel}
        </span>
        {draft.posted_by_rule_auto && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Auto-posted
          </span>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Supplier</h2>
        {draft.linked_supplier_name ? (
          <p className="text-sm">
            {draft.linked_supplier_name}
            {draft.linked_supplier_vkn && (
              <span className="ml-2 text-muted-foreground">
                VKN {draft.linked_supplier_vkn}
              </span>
            )}
            {draft.supplier_id && (
              <Link
                href={`/suppliers/${draft.supplier_id}`}
                className="ml-2 text-primary hover:underline"
              >
                View supplier
              </Link>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {draft.supplier_name ?? "Unknown"} · VKN{" "}
            {draft.supplier_vkn ?? "—"}
          </p>
        )}
        {draft.review_reason && (
          <p className="mt-2 text-sm text-warning">{draft.review_reason}</p>
        )}
        {isCreditNote && draft.referenced_invoice_number && (
          <p className="mt-2 text-sm text-muted-foreground">
            İadeye konu fatura: {draft.referenced_invoice_number}
            {draft.referenced_invoice_date
              ? ` (${formatTrDate(draft.referenced_invoice_date)})`
              : ""}
          </p>
        )}
      </div>

      {draft.has_stored_document && (
        <div className="rounded-lg border border-border bg-card p-4">
          <InvoiceDocumentPreview
            draftId={draft.id}
            sourceType={
              draft.source_type === "efatura_xml"
                ? "efatura_xml"
                : "efatura_pdf"
            }
          />
        </div>
      )}

      {viewOnly && draft.journal_entry_id && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Ledger entry</h2>
          <p className="text-sm text-muted-foreground">
            This invoice is booked in the general ledger.
          </p>
          {/* Edit and Void here, not only in the ledger and on the supplier.
              This screen was where you came to look at a posted invoice and
              the one place that could not act on it — a read-only page with a
              link, so correcting a wrong figure meant finding the same
              invoice again somewhere else. Same component the ledger uses, so
              the actions cannot drift apart. */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <GlEntryActions
              row={{
                id: draft.journal_entry_id,
                entry_date: draft.invoice_date,
                description: `Invoice ${draft.invoice_number}`,
                source: isCommission ? "delivery_commission" : "invoice",
                status: "posted",
              }}
              onGenericEdit={() => undefined}
              onSaved={() => onUpdated?.("updated")}
            />
            <Link
              href={journalEntryLedgerHref(draft.journal_entry_id)}
              className="text-sm text-primary hover:underline"
            >
              View journal entry
            </Link>
          </div>
        </div>
      )}

      {(isCommission || needsPlatformLink || draft.delivery_platform_id) && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Delivery platform</h2>
          {draft.linked_platform_name ? (
            <p className="text-sm">{draft.linked_platform_name}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Not linked yet</p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Amounts</h2>
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Net</dt>
            <dd className="tabular-nums">
              {amountsMissing ? "—" : formatTry(draft.net_kurus)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Gross</dt>
            <dd className="tabular-nums font-medium">
              {amountsMissing ? "—" : formatTry(draft.gross_kurus)}
            </dd>
          </div>
        </dl>
        {draft.vat_breakdown.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            {draft.vat_breakdown.map((line) => (
              <li key={line.rate_percent}>
                KDV {line.rate_percent}% — base {formatTry(line.base_kurus)},
                VAT {formatTry(line.vat_kurus)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
