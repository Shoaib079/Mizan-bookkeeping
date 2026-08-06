import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/** Every status the backend can send has a word for it.
 *
 * The group sales list translated "posted" and "voided" and let anything else
 * fall through to a hardcoded "pending". The backend's third status is
 * "amended" — the superseded original kept after a correction — so a sale you
 * had corrected was labelled as though it were waiting for something. It was
 * not waiting; it had been replaced, and nothing in this app is ever pending.
 *
 * The failure is invisible from either side alone: the backend was right, the
 * badge rendered fine, and only a person reading the screen could tell the
 * word was wrong. So the check has to span both.
 */

const STATUS_BADGE = readFileSync(
  new URL("./status-badge.tsx", import.meta.url),
  "utf8",
);

const GROUP_SALE_MODELS = new URL(
  "../../../../backend/app/features/group_sales/models.py",
  import.meta.url,
).pathname;

describe("StatusBadge covers the group sale statuses", () => {
  it("knows every value of GroupSaleStatus", () => {
    // Skip if the backend is not checked out alongside — a missing sibling
    // directory is not a missing label.
    if (!existsSync(GROUP_SALE_MODELS)) return;
    const python = readFileSync(GROUP_SALE_MODELS, "utf8");
    const block = python.match(
      /class GroupSaleStatus\(str, enum\.Enum\):([\s\S]*?)\n\n/,
    )?.[1];
    expect(block, "GroupSaleStatus not found — did it move?").toBeTruthy();

    const values = [...block!.matchAll(/=\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(values.length, "expected at least posted/voided/amended").toBeGreaterThan(2);

    for (const value of values) {
      // "posted" is deliberately translated to "active" by the group sales
      // page — a live booking reads better as Active. The rest go through
      // untranslated and must be known here.
      if (value === "posted") continue;
      expect(
        STATUS_BADGE,
        `StatusBadge has no label for "${value}", so it will render the raw enum`,
      ).toContain(`${value}:`);
    }
  });

  it("does not invent 'pending' for an unrecognised status", () => {
    const page = readFileSync(
      new URL(
        "../../app/(customers-section)/customers/group-sales/page.tsx",
        import.meta.url,
      ).pathname,
      "utf8",
    );
    const code = page
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(
      code,
      "an unknown status is being relabelled instead of shown",
    ).not.toContain('"pending"');
  });

  it("amended reads as replaced, not as in progress", () => {
    expect(STATUS_BADGE).toContain("amended: \"Amended\"");
    // Struck through, like a void: to a reader it no longer counts.
    const styles = STATUS_BADGE.match(/const statusStyles[\s\S]*?\n\};/)?.[0];
    expect(styles).toMatch(/amended:.*line-through/);
  });
});
