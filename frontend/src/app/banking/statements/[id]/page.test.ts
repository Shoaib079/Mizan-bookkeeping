import { describe, expect, it } from "vitest";

describe("StatementDetailPage", () => {
  it("defaults ledger to unposted queue via defaultStatementLineFilter", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./page.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("defaultStatementLineFilter");
    expect(source).toContain("defaultFilter={ledgerDefaultFilter}");
    expect(source).toContain("queueLines(statement.lines)");
  });

  it("uses queue when work remains and all lines when queue is empty", async () => {
    const filtersSource = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../../../lib/statement-line-filters.ts", import.meta.url),
        "utf8",
      ),
    );
    expect(filtersSource).toContain('return queueLines(lines).length > 0 ? "queue" : "all"');
  });

  it("remounts ledger on statement navigation so default filter applies after import", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./page.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("key={statementId}");
  });
});

describe("StatementLinesLedger default view", () => {
  it("defaults to queue filter and exposes All lines toggle", async () => {
    const ledgerSource = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../../../components/statement-lines-ledger.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(ledgerSource).toContain("defaultFilter = \"queue\"");
    expect(ledgerSource).toContain("defaultFilter?: StatementLineFilter");
    expect(ledgerSource).toContain('useState<StatementLineFilter>(defaultFilter)');

    const filtersSource = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../../../lib/statement-line-filters.ts", import.meta.url),
        "utf8",
      ),
    );
    expect(filtersSource).toContain('{ id: "queue", label: "To post" }');
    expect(filtersSource).toContain('{ id: "all", label: "All lines" }');
    const queueTab = filtersSource.indexOf('{ id: "queue", label: "To post" }');
    const allTab = filtersSource.indexOf('{ id: "all", label: "All lines" }');
    expect(queueTab).toBeGreaterThanOrEqual(0);
    expect(allTab).toBeGreaterThan(queueTab);
  });

  it("All lines filter shows posted rows via matchesStatementLineFilter", async () => {
    const filtersSource = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../../../lib/statement-line-filters.ts", import.meta.url),
        "utf8",
      ),
    );
    expect(filtersSource).toContain('case "all":');
    expect(filtersSource).toContain("return true");
    expect(filtersSource).toContain('case "queue":');
    expect(filtersSource).toContain("isQueueLine(line)");
  });
});
