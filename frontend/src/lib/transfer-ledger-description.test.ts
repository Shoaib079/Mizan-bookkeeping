import { describe, expect, it } from "vitest";

import {
  buildTransferDisplayDescription,
  formatTransferAccountLabel,
  noteFromPayload,
} from "@/lib/transfer-ledger-description";

describe("transfer ledger descriptions", () => {
  it("old transfer row shows from → to labels", () => {
    expect(
      buildTransferDisplayDescription({
        fromLabel: formatTransferAccountLabel("Main Drawer", "cash"),
        toLabel: formatTransferAccountLabel("Garanti", "bank"),
      }),
    ).toBe("Transfer · Main Drawer (cash) → Garanti (bank)");
  });

  it("appends owner note only when present", () => {
    expect(
      buildTransferDisplayDescription({
        fromLabel: "Main Drawer (cash)",
        toLabel: "Garanti (bank)",
        note: "night drop",
      }),
    ).toBe("Transfer · Main Drawer (cash) → Garanti (bank) — night drop");
    expect(
      buildTransferDisplayDescription({
        fromLabel: "Main Drawer (cash)",
        toLabel: "Garanti (bank)",
        note: noteFromPayload("Account transfer"),
      }),
    ).toBe("Transfer · Main Drawer (cash) → Garanti (bank)");
  });

  it("mutation: bare Account transfer alone is not a finished description", () => {
    const composed = buildTransferDisplayDescription({
      fromLabel: formatTransferAccountLabel("Main Drawer", "cash"),
      toLabel: formatTransferAccountLabel("Garanti", "bank"),
      note: noteFromPayload("Account transfer"),
    });
    expect(composed).not.toBe("Account transfer");
    expect(composed).toContain("→");
    expect(composed).toContain("Main Drawer");
  });
});
