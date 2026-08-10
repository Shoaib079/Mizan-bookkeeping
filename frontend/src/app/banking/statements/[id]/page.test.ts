import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("StatementDetailPage", () => {
  it("defaults ledger to unposted queue via defaultStatementLineFilter", () => {
    const source = sourceDeclaring("StatementDetailPage");
    expect(source).toContain("defaultStatementLineFilter");
    expect(source).toContain("defaultFilter={ledgerDefaultFilter}");
    expect(source).toContain("queueLines(statement.lines)");
  });

  it("uses queue when work remains and all lines when queue is empty", () => {
    const filtersSource = sourceDeclaring("STATEMENT_LINE_FILTERS");
    expect(filtersSource).toContain('return queueLines(lines).length > 0 ? "queue" : "all"');
  });

  it("remounts ledger on statement navigation so default filter applies after import", () => {
    const source = sourceDeclaring("StatementDetailPage");
    expect(source).toContain("key={statementId}");
  });

  it("patches one line after post instead of full reload with loading flash", () => {
    const source = sourceDeclaring("StatementDetailPage");
    const barSource = sourceDeclaring("StatementClassifyBar");
    expect(source).toContain("replaceStatementLine");
    expect(source).toContain("handlePosted");
    expect(source).not.toMatch(/handlePosted[\s\S]*void reload\(\)/);
    expect(barSource).toContain("onPosted(result)");
    expect(barSource).toContain("ClassifyStatementLineResult");
  });

  it("opens salary period dialog when correcting staff_payment lines", () => {
    const barSource = sourceDeclaring("StatementClassifyBar");
    expect(barSource).toContain('setSalaryDialogPurpose("correct")');
    expect(barSource).toContain("executeCorrect(periodFields)");
    expect(barSource).toContain("openCorrectDialog");
    expect(barSource).toContain("postedLineTargetSummary");
    expect(barSource).toContain("hydrateStatementLineFormState");
  });
});

describe("StatementLinesLedger default view", () => {
  it("defaults to queue filter and exposes All lines toggle", () => {
    const ledgerSource = sourceDeclaring("StatementLinesLedger");
    expect(ledgerSource).toContain("defaultFilter = \"queue\"");
    expect(ledgerSource).toContain("defaultFilter?: StatementLineFilter");
    expect(ledgerSource).toContain('useState<StatementLineFilter>(defaultFilter)');

    const filtersSource = sourceDeclaring("STATEMENT_LINE_FILTERS");
    expect(filtersSource).toContain('{ id: "queue", label: "To post" }');
    expect(filtersSource).toContain('{ id: "all", label: "All lines" }');
    const queueTab = filtersSource.indexOf('{ id: "queue", label: "To post" }');
    const allTab = filtersSource.indexOf('{ id: "all", label: "All lines" }');
    expect(queueTab).toBeGreaterThanOrEqual(0);
    expect(allTab).toBeGreaterThan(queueTab);
  });

  it("All lines filter shows posted rows via matchesStatementLineFilter", () => {
    const filtersSource = sourceDeclaring("STATEMENT_LINE_FILTERS");
    expect(filtersSource).toContain('case "all":');
    expect(filtersSource).toContain("return true");
    expect(filtersSource).toContain('case "queue":');
    expect(filtersSource).toContain("isQueueLine(line)");
  });
});
