import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { twMerge } from "tailwind-merge";

/** 75 buttons were `secondary` and 53 were `ghost`, and neither read as a
 * button. `secondary` was `bg-background` — the page's own colour behind a
 * hairline border. `ghost` had no background and no border at all, appearing
 * only on hover, which does not exist on a phone.
 */

const source = readFileSync(new URL("./button.tsx", import.meta.url), "utf8");

describe("button variants carry colour", () => {
  it("secondary is not painted in the page background", () => {
    expect(source).not.toContain('"border border-border bg-background');
    expect(source).toContain("border-primary/40");
    expect(source).toContain("text-primary");
  });

  it("ghost is visible before it is hovered", () => {
    // `variant === "ghost" && "hover:bg-muted"` was the whole style: nothing
    // at rest, and a phone has no hover to reveal it.
    expect(source).not.toMatch(/variant === "ghost" && "hover:bg-muted"/);
    expect(source).toMatch(/variant === "ghost" && "text-primary/);
  });

  it("secondary carries a fill, and recolouring requires one too", () => {
    // A border alone still read as an outline of nothing beside a filled
    // primary — "border but no colour" was the report from three screens.
    // The fill means a caller that recolours has to pass a background as
    // well: tailwind-merge resolves the text and border but has nothing to
    // override an unmentioned bg with, so red text would sit on blue.
    // /15, not /5. bg-primary/5 over white computes to #f4f7fe — three units
    // from white in red, eleven in blue. It is a fill in the markup and
    // nothing to the eye, which is why "no colour" was reported after it was
    // supposedly fixed. A minimum opacity stops that recurring.
    // Scoped to the secondary line: matching the whole file grabbed
    // hover:bg-primary/90 from the primary variant, so this passed happily
    // with the secondary fill back at /5.
    const secondaryLine = source.match(
      /variant === "secondary" &&[\s\S]{0,160}/,
    )?.[0] ?? "";
    const fill = secondaryLine.match(/[^:]bg-primary\/(\d+)/)?.[1];
    expect(Number(fill), "secondary has no fill").toBeGreaterThanOrEqual(10);
    const voidButton = readFileSync(
      new URL("../ledger/void-confirm-dialog.tsx", import.meta.url),
      "utf8",
    );
    expect(voidButton).toContain("bg-destructive/5");
  });

  it("a caller's own colour still wins", () => {
    const secondary = "border border-primary/40 bg-primary/15 text-primary hover:bg-primary/25";
    const ghost = "text-primary hover:bg-primary/15";

    const voidSecondary = twMerge(
      secondary,
      "border-destructive/40 text-destructive hover:bg-destructive/10",
    );
    expect(voidSecondary).toContain("text-destructive");
    expect(voidSecondary).not.toContain("text-primary");
    expect(voidSecondary).not.toContain("border-primary/40");

    const mutedGhost = twMerge(ghost, "text-muted-foreground");
    expect(mutedGhost).toContain("text-muted-foreground");
    expect(mutedGhost).not.toContain("text-primary");
  });
});
