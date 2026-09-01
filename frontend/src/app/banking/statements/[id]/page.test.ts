import { describe, expect, it } from "vitest";

import { codeOnly, sourceDeclaring, sourceDeclaringAll } from "@/test-support/source";

describe("the page has one scroll area", () => {
  /* Reported: scrolling the line table slid its header up over the
   * classification pickers and the Post button, hiding where to post.
   *
   * The page scrolled *and* the table had its own 65vh scrollbar, with the
   * classify bar pinned across the seam. Both the bar and the table's header
   * were `sticky top-0 z-10`, so paint order fell to DOM order — and the table
   * comes later. Raising the bar's z-index would have hidden the column
   * headings instead; the fault was two scroll areas, not the number.
   *
   * Pinned as structure because the symptom is geometry, which jsdom does not
   * compute: nothing here may be sticky, and the table takes the room left
   * rather than a fraction of the viewport. */
  it("nothing on it is sticky", () => {
    for (const symbol of [
      "StatementDetailPage",
      "StatementClassifyBar",
      "StatementBulkActionBar",
      "StatementLinesLedger",
    ]) {
      // `codeOnly`: the comment above explains why nothing is sticky, and
      // says the word. A rule must not be tripped by its own reason.
      expect(
        codeOnly(sourceDeclaring(symbol)),
        `${symbol} pins itself again`,
      ).not.toMatch(/\bsticky\b/);
    }
  });

  it("the table fills the room left instead of a slice of the viewport", () => {
    const ledger = codeOnly(sourceDeclaring("StatementLinesLedger"));
    expect(ledger).not.toContain("max-h-[min(65vh,800px)]");
    expect(ledger).toContain("min-h-0 flex-1");
    // A flex child only fills if its parent is a column that can shrink.
    expect(sourceDeclaring("StatementDetailPage")).toContain(
      "flex h-full min-h-0 flex-col",
    );
  });
});

describe("discarding an import says why when it cannot", () => {
  /* Reported: "I can see the Discard import button but it is not working."
   *
   * It was refusing correctly — a statement whose lines are in the ledger
   * cannot be removed without orphaning those entries, and both the button and
   * the backend say so. What was missing was the *reason*: a faded button with
   * its cause written in a separate paragraph elsewhere on the card reads as a
   * broken button, not a refused one.
   *
   * And underneath that, a genuine fault: when the backend refused with a 409,
   * the message was written to the page-level error, which renders above the
   * summary card — behind the modal that was still open. Pressing Discard did
   * nothing visible at all. */
  it("counts the blocking lines rather than only knowing that there are some", () => {
    const filters = sourceDeclaring("statementDiscardBlockers");
    // canDiscardStatement is derived from it, so the two cannot disagree about
    // what blocks — which is the thing the message is about to claim.
    expect(filters).toContain("statementDiscardBlockers(lines).length === 0");
  });

  it("puts the reason on the button, not elsewhere on the page", () => {
    const page = codeOnly(sourceDeclaring("StatementDetailPage"));
    expect(page).toContain("discardBlockers.length");
    // The old free-floating paragraph is gone rather than left beside the new
    // one — two explanations of the same refusal is how one goes stale.
    expect(page).not.toContain("Void or correct them in Review first");
  });

  it("shows a failed discard inside the dialog", () => {
    const page = codeOnly(sourceDeclaring("StatementDetailPage"));
    expect(page).toContain("setDiscardError");
    // The catch must not fall back to the page-level error, which the open
    // dialog covers.
    expect(page).not.toMatch(/catch[\s\S]{0,120}setError\([^)]*Discard failed/);
  });
});

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

  it("opens payment bounced from return inflows, not outflows", () => {
    const source = sourceDeclaring("StatementDetailPage");
    expect(source).toContain("barLine.amount_kurus > 0");
    expect(source).not.toMatch(/bounceOutflow/);
    expect(source).toContain("bounceReturn");
  });

  it("patches one line after post instead of full reload with loading flash", () => {
    const source = sourceDeclaring("StatementDetailPage");
    const barSource = sourceDeclaringAll(
      "StatementClassifyBar",
      "useStatementClassifyBar",
    );
    expect(source).toContain("replaceStatementLine");
    expect(source).toContain("handlePosted");
    expect(source).not.toMatch(/handlePosted[\s\S]*void reload\(\)/);
    expect(barSource).toContain("onPosted(result)");
    expect(barSource).toContain("ClassifyStatementLineResult");
  });

  it("opens salary period dialog when correcting staff_payment lines", () => {
    const barSource = sourceDeclaringAll(
      "StatementClassifyBar",
      "useStatementClassifyBar",
    );
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
