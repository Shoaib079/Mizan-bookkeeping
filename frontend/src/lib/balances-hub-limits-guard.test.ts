import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** API list endpoints reject limit > 200 (MAX_LIST_LIMIT). */
const MAX = 200;

describe("Balances hub list limits", () => {
  it("never requests staff/partners/payables/receivables above the API max", () => {
    const files = [
      "use-subledger-total.ts",
      "use-balance-map.ts",
    ].map((name) =>
      readFileSync(resolve(__dirname, name), "utf8"),
    );
    const joined = files.join("\n");
    expect(joined).not.toMatch(/limit=500/);
    expect(joined).toMatch(`limit=${MAX}`);
  });
});
