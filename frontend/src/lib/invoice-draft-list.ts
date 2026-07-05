/** Invoice draft list queries and posted-invoice view helpers. */

import { buildRangeQuery } from "@/lib/date-range";

export type InvoiceReviewTab = "pending" | "ready" | "posted" | "all";

export const INVOICE_REVIEW_TABS: {
  id: InvoiceReviewTab;
  label: string;
}[] = [
  { id: "pending", label: "Pending review" },
  { id: "ready", label: "Ready to post" },
  { id: "posted", label: "Posted" },
  { id: "all", label: "All" },
];

export function filterInvoicesByTab<T extends { status: string }>(
  items: T[],
  tab: InvoiceReviewTab,
): T[] {
  switch (tab) {
    case "pending":
      return items.filter(
        (row) =>
          row.status === "draft" ||
          row.status === "needs_review" ||
          row.status === "duplicate",
      );
    case "ready":
      return items.filter((row) => row.status === "confirmed");
    case "posted":
      return items.filter((row) => row.status === "posted");
    case "all":
      return items;
    default:
      return items;
  }
}

export function invoiceReviewEmptyState(tab: InvoiceReviewTab): {
  title: string;
  hint: string;
} {
  switch (tab) {
    case "posted":
      return {
        title: "No posted invoices for this period",
        hint: "Posted supplier and commission e-Faturas appear here after booking. Adjust the date range or post invoices from the workbench tabs.",
      };
    case "ready":
      return {
        title: "Nothing ready to post",
        hint: "Confirmed invoices waiting for post-to-ledger will appear here.",
      };
    case "all":
      return {
        title: "No invoices",
        hint: "Upload e-Fatura files from Record or a supplier page.",
      };
    default:
      return {
        title: "No supplier invoices in progress",
        hint: "Upload e-Fatura files from Record or a supplier page. They appear here for review, then post to ledger to update payables.",
      };
  }
}

export type InvoiceDraftListRow = {
  id: string;
  status: string;
  invoice_kind: string;
  invoice_number: string;
  invoice_date: string;
  supplier_name: string | null;
  linked_platform_name: string | null;
  gross_kurus: number;
  review_reason: string | null;
  has_stored_document: boolean;
  source_type: string;
  journal_entry_id?: string | null;
  delivery_platform_id?: string | null;
};

export function invoiceDraftsListPath(options: {
  status?: string;
  invoice_kind?: string;
  delivery_platform_id?: string;
  from?: string;
  to?: string;
  limit?: number;
}): string {
  const params = new URLSearchParams();
  if (options.status) params.set("status", options.status);
  if (options.invoice_kind) params.set("invoice_kind", options.invoice_kind);
  if (options.delivery_platform_id) {
    params.set("delivery_platform_id", options.delivery_platform_id);
  }
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  params.set("limit", String(options.limit ?? 50));
  const qs = params.toString();
  return qs ? `/invoices/drafts?${qs}` : "/invoices/drafts";
}

export function postedInvoicesListPath(from: string, to: string): string {
  return invoiceDraftsListPath({
    status: "posted",
    from,
    to,
    limit: 100,
  });
}

export function postedCommissionInvoicesListPath(from?: string, to?: string): string {
  return invoiceDraftsListPath({
    status: "posted",
    invoice_kind: "delivery_commission",
    from,
    to,
    limit: 100,
  });
}

export function invoiceCounterpartyLabel(row: InvoiceDraftListRow): string {
  const isCommission = row.invoice_kind === "delivery_commission";
  if (isCommission) {
    return row.linked_platform_name ?? row.supplier_name ?? "—";
  }
  return row.supplier_name ?? "—";
}

export function isInvoiceDraftReadOnly(
  status: string,
  readOnly?: boolean,
): boolean {
  return Boolean(readOnly || status === "posted" || status === "rejected");
}

export function journalEntryLedgerHref(journalEntryId: string): string {
  return `/reports/ledger?focus=${encodeURIComponent(journalEntryId)}`;
}

export function postedInvoicesEmptyHint(hasDateFilter: boolean): string {
  return hasDateFilter
    ? "No posted invoices for this period."
    : "No posted invoices yet.";
}

export function groupCommissionInvoicesByPlatform<
  T extends { delivery_platform_id?: string | null; linked_platform_name?: string | null },
>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key =
      item.delivery_platform_id ??
      item.linked_platform_name ??
      "unknown-platform";
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }
  return grouped;
}

export { buildRangeQuery };
