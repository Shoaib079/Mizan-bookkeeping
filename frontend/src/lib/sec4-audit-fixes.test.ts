import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";


describe("SEC-4: M1 — Role gating defaults to least privilege", () => {
  it("DEFAULT_DEV_ROLE is partner_view_only, not owner", async () => {
    const src = sourceDeclaring("DEFAULT_DEV_ROLE");
    expect(src).toContain('"partner_view_only"');
    expect(src).not.toMatch(/DEFAULT_DEV_ROLE.*"owner"/);
  });

  it("error fallback also uses the least-privilege constant", async () => {
    const src = sourceDeclaring("DEFAULT_DEV_ROLE");
    expect(src).toContain("DEFAULT_DEV_ROLE");
    expect(src).toContain("setRole(DEFAULT_DEV_ROLE)");
  });
});

describe("SEC-4: M2 — FX parser uses parseTryParts (no 100× bug)", () => {
  it("parseTryParts is exported from money.ts", async () => {
    const src = sourceDeclaring("formatKurus");
    expect(src).toMatch(/export function parseTryParts/);
  });

  it("parseFxNative imports parseTryParts instead of using parseFloat", async () => {
    const src = sourceDeclaring("formatForexBalanceLine");
    // Match the named import, not the whole import statement — the module also
    // pulls in formatKurus (for formatFxNativeInput), and pinning the exact
    // statement text made an unrelated addition look like a regression.
    expect(src).toMatch(/import \{[^}]*\bparseTryParts\b[^}]*\} from "@\/lib\/money"/);
    expect(src).not.toContain("parseFloat");
  });

  it("parseFxNative('100.50') → 10050 (not 1005000)", async () => {
    const { parseFxNative } = await import("./fx-money");
    expect(parseFxNative("100.50")).toBe(10050);
  });

  it("parseFxNative('1.234,56') → 123456", async () => {
    const { parseFxNative } = await import("./fx-money");
    expect(parseFxNative("1.234,56")).toBe(123456);
  });

  it("parseFxNative('100,50') → 10050", async () => {
    const { parseFxNative } = await import("./fx-money");
    expect(parseFxNative("100,50")).toBe(10050);
  });

  it("parseFxNative('50') → 5000", async () => {
    const { parseFxNative } = await import("./fx-money");
    expect(parseFxNative("50")).toBe(5000);
  });
});

describe("SEC-4: M3 — Drawer reopen POST sends Idempotency-Key", () => {
  it("cash page imports newIdempotencyKey and attaches it to reopen call", async () => {
    const src = sourceDeclaring("CashDrawerPage");
    expect(src).toContain("newIdempotencyKey");
    expect(src).toMatch(/idempotencyKey:\s*newIdempotencyKey\(\)/);
  });
});

describe("SEC-4: M4 — API_BASE fails loud in production browser", () => {
  it("assertApiBase guard exists and is called in apiFetch and apiDownload", async () => {
    const src = sourceDeclaring("AUTH_401_MAX_ATTEMPTS");
    expect(src).toContain("function assertApiBase()");
    const apiFetchMatch = src.match(
      /export async function apiFetch[\s\S]*?assertApiBase\(\)/,
    );
    expect(apiFetchMatch).not.toBeNull();
    const apiDownloadMatch = src.match(
      /export async function apiDownload[\s\S]*?assertApiBase\(\)/,
    );
    expect(apiDownloadMatch).not.toBeNull();
  });

  it("assertApiBase throws when localhost + window + production", async () => {
    const src = sourceDeclaring("AUTH_401_MAX_ATTEMPTS");
    expect(src).toContain("NEXT_PUBLIC_API_URL must be set");
    expect(src).toContain('typeof window !== "undefined"');
    expect(src).toContain('process.env.NODE_ENV === "production"');
  });

  it("api.ts falls back to same-origin /backend-api in development", async () => {
    const src = sourceDeclaring("AUTH_401_MAX_ATTEMPTS");
    expect(src).toContain('"/backend-api"');
  });
});
