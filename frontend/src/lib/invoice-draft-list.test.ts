import { describe, expect, it } from "vitest";

import {
  filterInvoicesByTab,
  groupCommissionInvoicesByPlatform,
  invoiceCounterpartyLabel,
  invoiceDraftsListPath,
  isInvoiceDraftReadOnly,
  journalEntryLedgerHref,
  postedInvoicesEmptyHint,
  postedInvoicesListPath,
} from "@/lib/invoice-draft-list";

describe("invoiceDraftsListPath", () => {
  it("builds posted filter query", () => {
    expect(postedInvoicesListPath("2026-01-01", "2026-01-31")).toBe(
      "/invoices/drafts?status=posted&from=2026-01-01&to=2026-01-31&limit=100",
    );
  });

  it("includes invoice_kind and delivery_platform_id", () => {
    expect(
      invoiceDraftsListPath({
        status: "posted",
        invoice_kind: "delivery_commission",
        delivery_platform_id: "plat-1",
      }),
    ).toBe(
      "/invoices/drafts?status=posted&invoice_kind=delivery_commission&delivery_platform_id=plat-1&limit=50",
    );
  });
});

describe("isInvoiceDraftReadOnly", () => {
  it("treats posted and rejected as read-only", () => {
    expect(isInvoiceDraftReadOnly("posted")).toBe(true);
    expect(isInvoiceDraftReadOnly("rejected")).toBe(true);
    expect(isInvoiceDraftReadOnly("confirmed")).toBe(false);
  });

  it("honours explicit readOnly flag", () => {
    expect(isInvoiceDraftReadOnly("draft", true)).toBe(true);
  });
});

describe("invoiceCounterpartyLabel", () => {
  it("uses platform name for commission rows", () => {
    expect(
      invoiceCounterpartyLabel({
        id: "1",
        status: "posted",
        invoice_kind: "delivery_commission",
        invoice_number: "C-1",
        invoice_date: "2026-01-01",
        supplier_name: "Getir Perakende",
        linked_platform_name: "Getir",
        gross_kurus: 1000,
        review_reason: null,
        has_stored_document: true,
        source_type: "efatura_pdf",
      }),
    ).toBe("Getir");
  });
});

describe("filterInvoicesByTab", () => {
  const rows = [
    { id: "1", status: "draft" },
    { id: "2", status: "confirmed" },
    { id: "3", status: "posted" },
    { id: "4", status: "needs_review" },
  ];

  it("filters pending and ready tabs", () => {
    expect(filterInvoicesByTab(rows, "pending")).toHaveLength(2);
    expect(filterInvoicesByTab(rows, "ready")).toHaveLength(1);
    expect(filterInvoicesByTab(rows, "posted")).toHaveLength(1);
    expect(filterInvoicesByTab(rows, "all")).toHaveLength(4);
  });
});

describe("posted invoice read-only detail", () => {
  it("hides mutate actions for posted status", () => {
    expect(isInvoiceDraftReadOnly("posted", false)).toBe(true);
  });

  it("exposes ledger href for journal entry link", () => {
    expect(journalEntryLedgerHref("je-posted-1")).toContain("focus=je-posted-1");
  });
});

describe("groupCommissionInvoicesByPlatform", () => {
  it("groups by delivery_platform_id", () => {
    const grouped = groupCommissionInvoicesByPlatform([
      { delivery_platform_id: "p1", linked_platform_name: "Getir" },
      { delivery_platform_id: "p2", linked_platform_name: "Yemeksepeti" },
      { delivery_platform_id: "p1", linked_platform_name: "Getir" },
    ]);
    expect(grouped.get("p1")).toHaveLength(2);
    expect(grouped.get("p2")).toHaveLength(1);
  });
});

describe("postedInvoicesEmptyHint", () => {
  it("uses period-specific copy when filtered", () => {
    expect(postedInvoicesEmptyHint(true)).toBe(
      "No posted invoices for this period.",
    );
    expect(postedInvoicesEmptyHint(false)).toBe("No posted invoices yet.");
  });
});

describe("journalEntryLedgerHref", () => {
  it("links to ledger focus param", () => {
    expect(journalEntryLedgerHref("abc-123")).toBe(
      "/reports/ledger?focus=abc-123",
    );
  });
});
