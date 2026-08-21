/** S15 Part A — directory balance direction labels.

Assert the shared helper (and the cell that uses it): flip the sign → flip
the label. Pages must not invent a second "owes you" / "you owe" rule.
*/

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DirectoryBalanceCell } from "@/components/directory-balance-cell";
import {
  balanceHeading,
  directoryBalanceDirection,
} from "@/lib/subledger-balance";
import { sourceDeclaring, sourceFiles } from "@/test-support/source";

describe("directoryBalanceDirection", () => {
  it("matches balanceHeading for every party (single rule)", () => {
    for (const party of ["employee", "partner", "customer", "supplier"] as const) {
      expect(directoryBalanceDirection(12_345, party)).toBe(
        balanceHeading(12_345, party),
      );
      expect(directoryBalanceDirection(-12_345, party)).toBe(
        balanceHeading(-12_345, party),
      );
      expect(directoryBalanceDirection(0, party)).toBe("Settled");
    }
  });

  it("flips the label when the sign flips", () => {
    expect(directoryBalanceDirection(100, "customer")).toBe("You owe customer");
    expect(directoryBalanceDirection(-100, "customer")).toBe(
      "Customer owes you",
    );
    expect(directoryBalanceDirection(100, "supplier")).toBe("You owe supplier");
    expect(directoryBalanceDirection(-100, "supplier")).toBe(
      "Supplier owes you",
    );
  });
});

describe("DirectoryBalanceCell", () => {
  it("renders direction that flips with sign", () => {
    const positive = renderToStaticMarkup(
      <DirectoryBalanceCell
        balanceMinor={50_000}
        party="partner"
        formatAbs={(n) => `${n}`}
      />,
    );
    const negative = renderToStaticMarkup(
      <DirectoryBalanceCell
        balanceMinor={-50_000}
        party="partner"
        formatAbs={(n) => `${n}`}
      />,
    );
    expect(positive).toContain("You owe partner");
    expect(positive).toContain('data-balance-sign="positive"');
    expect(negative).toContain("Partner owes you");
    expect(negative).toContain('data-balance-sign="negative"');
  });

  it("delegates wording to directoryBalanceDirection", () => {
    expect(sourceDeclaring("DirectoryBalanceCell")).toContain(
      "directoryBalanceDirection",
    );
  });
});

describe("directories use DirectoryBalanceCell", () => {
  it("each list page imports the shared cell", () => {
    const needles = [
      "app/staff/page.tsx",
      "app/partners/page.tsx",
      "app/(customers-section)/customers/page.tsx",
      "app/(procurement)/suppliers/page.tsx",
    ];
    const byPath = new Map(sourceFiles().map((f) => [f.path, f.text]));
    for (const needle of needles) {
      const text = byPath.get(needle);
      expect(text, needle).toBeDefined();
      expect(text!).toContain("DirectoryBalanceCell");
      expect(text!).not.toMatch(/owes you"/);
    }
  });
});
