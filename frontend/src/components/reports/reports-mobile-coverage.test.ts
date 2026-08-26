import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

/** Every report money table must ship MobileCardList. Named exports are
 * located by symbol so a file move does not break the guard. */

const TABLE_SYMBOLS = [
  "CashBookSourceTotals",
  "CashBookCountHistory",
  "CashBookMovements",
  "ExpenseRegisterAccountTotals",
  "ExpenseRegisterEntries",
  "ReportAccountRows",
  "CashFlowByCategory",
  "CashFlowBySource",
  "DeliverySalesPlatformTable",
  "KdvInputRateTable",
  "PeriodComparisonMetricsTable",
  "BankReconciliationLines",
  "GeneralLedgerTable",
] as const;

describe("reports mobile card coverage", () => {
  it("every report table module forks to MobileCardList", () => {
    for (const name of TABLE_SYMBOLS) {
      const source = sourceDeclaring(name);
      expect(source, name).toContain("MobileCardList");
      expect(source, name).toMatch(/isMobile|useIsMobileShell/);
    }
  });
});
