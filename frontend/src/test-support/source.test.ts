/** The helper every other guard is about to depend on.
 *
 * If `sourceDeclaring` silently returned "" for a symbol that no longer
 * exists, every guard built on it would pass over nothing — the Class 8
 * failure, multiplied by thirty. So the throwing paths are the important
 * tests here, not the happy one.
 */

import { describe, expect, it } from "vitest";

import {
  codeContains,
  fileDeclaring,
  filesContaining,
  sourceAt,
  sourceDeclaring,
  sourceDeclaringAll,
  sourceFiles,
} from "@/test-support/source";

describe("finding source by symbol", () => {
  it("scans a real tree", () => {
    // Over an empty list every lookup throws "not declared", which reads like
    // the app is missing rather than the scan being broken.
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(400);
    expect(files.some((f) => f.path.endsWith(".tsx"))).toBe(true);
    expect(files.every((f) => !f.path.includes(".test."))).toBe(true);
  });

  it("finds a function, a component and a type", () => {
    expect(sourceDeclaring("editTargetFor")).toContain("case \"expense\":");
    expect(sourceDeclaring("GlEditDialogs")).toContain("CorrectExpenseForm");
    expect(sourceDeclaring("GlEditTarget")).toContain("group_sale");
  });

  it("reports where something lives", () => {
    expect(fileDeclaring("GlEditDialogs")).toBe(
      "components/ledger/gl-edit-dialogs.tsx",
    );
  });

  it("throws, loudly, for a symbol nothing declares", () => {
    // The whole point. A guard naming a renamed symbol must fail with that
    // name in the message, not quietly assert about an empty string.
    expect(() => sourceDeclaring("ThisWasRenamedLastYear")).toThrowError(
      /No file under src\/ declares ThisWasRenamedLastYear/,
    );
  });

  it("throws when two files declare the same name", () => {
    // `Props` is declared in dozens of components. An ambiguous answer would
    // silently assert against whichever sorted first.
    expect(() => sourceDeclaring("Props")).toThrowError(/files declare Props/);
  });

  it("joins a feature spread over several files, without duplicating one", () => {
    const desk = sourceDeclaringAll("RecordDesk", "RecordDeskIconGrid");
    expect(desk).toContain("RECORD_DESK_TILES");
    expect(desk).toContain("record-desk-icon-grid");

    const twice = sourceDeclaringAll("GlEditDialogs", "GlEditTarget");
    const once = sourceDeclaring("GlEditDialogs");
    // Both names live in one file; it must appear once, or a `toContain`
    // count or a `not.toContain` could be fooled.
    expect(twice).toBe(once);
  });

  it("reads a path when a symbol cannot name it, and says so when it cannot", () => {
    expect(sourceAt("app/record/page.tsx")).toContain("RecordDesk");
    expect(() => sourceAt("app/nowhere/page.tsx")).toThrowError(
      /Cannot read src\/app\/nowhere\/page\.tsx/,
    );
  });

  it("searches the tree for a string", () => {
    expect(codeContains('role="tab"')).toBe(true);
    expect(codeContains("wombat-driven accounting")).toBe(false);
    expect(filesContaining('role="tab"')).toContain(
      "components/record/record-desk-buttons.tsx",
    );
  });
});
