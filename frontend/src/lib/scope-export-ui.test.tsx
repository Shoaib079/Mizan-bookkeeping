/**
 * @vitest-environment jsdom
 *
 * scope:export UI gates — Download/Export hidden without the grant.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DownloadMenu } from "@/components/ui/download-menu";
import { canExportFiles } from "@/lib/entity-access";
import { grantsForRole } from "@/lib/member-grants";
import {
  fileDeclaring,
  sourceDeclaring,
  sourceFiles,
} from "@/test-support/source";

const accessState = {
  grants: grantsForRole("owner") as string[],
};

vi.mock("@/lib/use-entity-access", () => ({
  useEntityAccess: () => ({
    role: "owner",
    grants: accessState.grants,
    loading: false,
    membershipSettled: true,
    canWriteOperations: true,
    canWriteDailyTransactions: true,
    canReadFinancialReports: true,
    canReadReports: true,
    canAccessSettings: true,
    reload: async () => undefined,
  }),
}));

afterEach(() => {
  cleanup();
  accessState.grants = grantsForRole("owner");
});

describe("canExportFiles", () => {
  it("owner and partner have it; cashier and view-only do not", () => {
    expect(canExportFiles(grantsForRole("owner"))).toBe(true);
    expect(canExportFiles(grantsForRole("partner"))).toBe(true);
    expect(canExportFiles(grantsForRole("cashier"))).toBe(false);
    expect(canExportFiles(grantsForRole("partner_view_only"))).toBe(false);
  });
});

describe("DownloadMenu grant gate", () => {
  it("shows Download for owner", () => {
    accessState.grants = grantsForRole("owner");
    render(
      <DownloadMenu items={[{ label: "Excel", run: async () => undefined }]} />,
    );
    expect(screen.getByRole("button", { name: /Download/i })).toBeTruthy();
  });

  it("hides Download without scope:export and explains why", () => {
    accessState.grants = grantsForRole("partner_view_only");
    render(
      <DownloadMenu items={[{ label: "Excel", run: async () => undefined }]} />,
    );
    expect(screen.queryByRole("button", { name: /Download/i })).toBeNull();
    expect(screen.getByText(/Exports require owner or partner access/i)).toBeTruthy();
  });

  it("mutation: removing canExportFiles check from DownloadMenu goes red", () => {
    const source = sourceDeclaring("DownloadMenu");
    const broken = source.replace("canExportFiles(grants)", "true");
    expect(source).toContain("canExportFiles(grants)");
    expect(broken).not.toContain("canExportFiles(grants)");
  });
});

/** Paths that fetch a generated Excel/PDF (not raw attachments like logo). */
const GENERATED_EXPORT_URL =
  /\/export(?:\/|\.|\?|"|`|'|$)|month-pack|export\.pdf/;

function generatedExportTriggerFiles() {
  return sourceFiles().filter(
    (file) =>
      file.path.endsWith(".tsx") &&
      file.text.includes("apiDownload") &&
      GENERATED_EXPORT_URL.test(file.text),
  );
}

function referencesExportGrant(text: string): boolean {
  // Shared shell: DownloadMenu itself checks canExportFiles. Wrappers that
  // only render it are gated transitively. Standalones must name the helper.
  return (
    text.includes("canExportFiles") ||
    text.includes('from "@/components/ui/download-menu"') ||
    text.includes("<DownloadMenu")
  );
}

describe("generated-export triggers reference canExportFiles", () => {
  it("finds the known export surfaces", () => {
    const paths = generatedExportTriggerFiles().map((f) => f.path).sort();
    expect(paths.length).toBeGreaterThanOrEqual(8);
    expect(paths.some((p) => p.includes("month-pack-button"))).toBe(true);
    expect(paths.some((p) => p.includes("sales-review-panel"))).toBe(true);
    expect(paths.some((p) => p.includes("supplier-activity-export"))).toBe(
      true,
    );
  });

  it("every trigger file gates via canExportFiles or DownloadMenu", () => {
    const ungated = generatedExportTriggerFiles()
      .filter((f) => !referencesExportGrant(f.text))
      .map((f) => f.path);
    expect(ungated).toEqual([]);
  });

  it("mutation: standalone export button without canExportFiles goes red", () => {
    const path = fileDeclaring("MonthPackButton");
    const standalone = sourceDeclaring("MonthPackButton");
    expect(standalone).toContain("canExportFiles");
    const broken = standalone.replaceAll("canExportFiles", "ALWAYS_TRUE");
    expect(referencesExportGrant(broken)).toBe(false);

    const ungated = generatedExportTriggerFiles()
      .map((f) => (f.path === path ? { ...f, text: broken } : f))
      .filter((f) => !referencesExportGrant(f.text))
      .map((f) => f.path);
    expect(ungated).toContain(path);
  });
});
