/**
 * S3 — write chrome grant gates (mutation-checked source coverage).
 *
 * Each listed surface must call the helper that matches its backend guard.
 * Owner / ops roles always hold the grant; view-only lacks operations:write.
 */

import { describe, expect, it } from "vitest";

import {
  canUseRecordAction,
  canWriteDailyTransactions,
  shouldShowNewMenu,
  shouldShowWriteChrome,
} from "@/lib/entity-access";
import { grantsForRole } from "@/lib/member-grants";
import { sourceDeclaring } from "@/test-support/source";

/** Surfaces gated via useWriteChrome → shouldShowWriteChrome / canUseRecordAction */
const OPS_WRITE_SURFACES: { symbol: string; markers: string[] }[] = [
  {
    symbol: "PartnerDetailPage",
    markers: ["useWriteChrome", "showWrite", "Record", "Pay profit"],
  },
  {
    symbol: "StaffDetailPage",
    markers: ["useWriteChrome", "showWrite", "Pay salary", "Give advance"],
  },
  {
    symbol: "SupplierDetailPage",
    markers: ["useWriteChrome", "showWrite", "Record payment"],
  },
  {
    symbol: "CustomerDetailPage",
    markers: ["useWriteChrome", "showWrite", "customerDetailWriteChrome"],
  },
  {
    symbol: "customerDetailWriteChrome",
    markers: ["Record payment", "Group sale", "EditTitleButton"],
  },
  {
    symbol: "GroupSaleDetailPage",
    markers: ["useWriteChrome", "showWrite", "Record payment"],
  },
  {
    symbol: "PartnersPage",
    markers: ["useWriteChrome", "showWrite", "New partner"],
  },
  {
    symbol: "StaffPage",
    markers: ["useWriteChrome", "showWrite", "New employee"],
  },
  {
    symbol: "SuppliersPage",
    markers: ["useWriteChrome", "showWrite", "New supplier"],
  },
  {
    symbol: "CustomersPage",
    markers: ["useWriteChrome", "showWrite", "New customer"],
  },
  {
    symbol: "DeliveryPage",
    markers: ["useWriteChrome", "showWrite", "Record sales", "Record settlement"],
  },
  {
    symbol: "TransfersPage",
    markers: ["useWriteChrome", "showWrite", "New transfer"],
  },
  {
    symbol: "CashDrawerPage",
    markers: ["useWriteChrome", "showOpsWrite", "cashPageWriteHeader"],
  },
  {
    symbol: "cashPageWriteHeader",
    markers: ["Record movement", "Count cash", "Close day"],
  },
  {
    symbol: "useWriteChrome",
    markers: ["shouldShowWriteChrome", "canUseRecordAction"],
  },
];

describe("S3 write chrome helpers (role grants)", () => {
  const owner = grantsForRole("owner");
  const viewOnly = grantsForRole("partner_view_only");
  const noOps: string[] = viewOnly.filter((g) => g !== "operations:write");

  it("owner sees write chrome; partner_view_only and no-ops grants do not", () => {
    expect(shouldShowWriteChrome(owner)).toBe(true);
    expect(shouldShowWriteChrome(viewOnly)).toBe(false);
    expect(shouldShowWriteChrome(noOps)).toBe(false);
  });

  it("owner can count cash / close day; view-only cannot", () => {
    expect(canUseRecordAction(owner, "countCash")).toBe(true);
    expect(canUseRecordAction(owner, "closeDay")).toBe(true);
    expect(canUseRecordAction(viewOnly, "countCash")).toBe(false);
    expect(canUseRecordAction(viewOnly, "closeDay")).toBe(false);
    expect(shouldShowNewMenu(viewOnly)).toBe(false);
    expect(canWriteDailyTransactions(viewOnly)).toBe(false);
  });
});

describe("S3 write chrome surfaces are gated (source)", () => {
  it.each(OPS_WRITE_SURFACES)(
    "$symbol uses the write-chrome helper near its controls",
    ({ symbol, markers }) => {
      const source = sourceDeclaring(symbol);
      for (const marker of markers) {
        expect(source, `${symbol} missing ${marker}`).toContain(marker);
      }
    },
  );

  it("mutation check: dropping shouldShowWriteChrome from useWriteChrome goes red", () => {
    const source = sourceDeclaring("useWriteChrome");
    const broken = source.replaceAll("shouldShowWriteChrome", "NEVER_GATE");
    expect(broken).not.toContain("shouldShowWriteChrome");
    expect(source).toContain("shouldShowWriteChrome");
  });
});
