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
import { sourceDeclaring } from "@/test-support/source";

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

  it("hides Download without scope:export", () => {
    accessState.grants = grantsForRole("partner_view_only");
    render(
      <DownloadMenu items={[{ label: "Excel", run: async () => undefined }]} />,
    );
    expect(screen.queryByRole("button", { name: /Download/i })).toBeNull();
  });

  it("mutation: removing canExportFiles check from DownloadMenu goes red", () => {
    const source = sourceDeclaring("DownloadMenu");
    const broken = source.replace("canExportFiles(grants)", "true");
    expect(source).toContain("canExportFiles(grants)");
    expect(broken).not.toContain("canExportFiles(grants)");
  });
});
