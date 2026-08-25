
import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";
import { twMerge } from "tailwind-merge";

/** 75 buttons were `secondary` and 53 were `ghost`, and neither read as a
 * button. `secondary` was `bg-background` — the page's own colour behind a
 * hairline border. `ghost` had no background and no border at all, appearing
 * only on hover, which does not exist on a phone.
 */

const source = sourceDeclaring("Button");

describe("button variants carry colour", () => {
  it("secondary is not painted in the page background", () => {
    expect(source).not.toContain('"border border-border bg-background');
    // Filled, so there is no outline left to assert. What matters is that
    // secondary is not painted in the page background.
    expect(source).toContain("bg-primary text-primary-foreground");
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
    // Solid, not tinted. Every tinted outline — /5, then /15 — was reported
    // as "border, no colour"; the treatment that finally read as coloured was
    // a full fill, so secondary now matches primary exactly.
    const secondaryLine = source.match(
      /variant === "secondary" &&[\s\S]{0,120}/,
    )?.[0] ?? "";
    expect(secondaryLine).toContain("bg-primary text-primary-foreground");
    // hover:bg-primary/90 is legitimate; a resting bg-primary/N is the tint.
    expect(secondaryLine, "secondary is still a tint, not a fill").not.toMatch(
      /[^:]bg-primary\/\d/,
    );
    const voidButton = sourceDeclaring("VoidConfirmDialog");
    expect(voidButton).toContain("bg-destructive/5");
  });

  it("positive is filled sticker green", () => {
    const positiveLine =
      source.match(/variant === "positive" &&[\s\S]{0,120}/)?.[0] ?? "";
    expect(positiveLine).toContain("bg-success");
    expect(positiveLine).toContain("text-primary-foreground");
  });

  it("a caller's own colour still wins", () => {
    const secondary = "bg-primary text-primary-foreground hover:bg-primary/90";
    const ghost = "text-primary hover:bg-primary/15";

    const voidSecondary = twMerge(
      secondary,
      "border-destructive/40 text-destructive hover:bg-destructive/10",
    );
    expect(voidSecondary).toContain("text-destructive");
    expect(voidSecondary).not.toContain("text-primary");
    expect(voidSecondary).not.toContain("text-primary-foreground");

    const mutedGhost = twMerge(ghost, "text-muted-foreground");
    expect(mutedGhost).toContain("text-muted-foreground");
    expect(mutedGhost).not.toContain("text-primary");
  });
});
