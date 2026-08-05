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

  it("secondary carries no fill, so a recoloured button stays clean", () => {
    // Void passes destructive border and text. tailwind-merge resolves those,
    // but a bg-primary tint would survive underneath as blue behind red.
    expect(source).not.toContain("bg-primary/5");
  });

  it("a caller's own colour still wins", () => {
    const secondary = "border border-primary/40 text-primary hover:bg-primary/10";
    const ghost = "text-primary hover:bg-primary/10";

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
