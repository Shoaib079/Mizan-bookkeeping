import { describe, expect, it } from "vitest";

import { fileDeclaring, sourceDeclaring, sourceFiles } from "@/test-support/source";

/** Everything you can click has to look like you can click it.
 *
 * This exists because finding the colourless controls meant opening pages one
 * at a time and photographing them. Two variants of `Button` and the filter
 * chips had no colour at rest — 128 buttons plus every filter row — and the
 * only way that surfaced was someone noticing. A rule that a person has to
 * remember is not a rule; this is the same rule a test can hold.
 *
 * Two things are checked:
 *
 *  1. The shared components carry colour. Fix `Button` and 280 call sites are
 *     fixed at once, which is the whole reason they are shared.
 *  2. No hand-rolled `<button>` reintroduces the problem. A styled button that
 *     names no colour is either invisible at rest or grey-on-grey.
 *
 * Read from source rather than rendered: the question is which classes exist,
 * and mounting every screen to ask it would be slower and no more certain.
 */

/** Tokens that count as "this is visibly interactive". */
const COLOUR_TOKENS = [
  "text-primary",
  "bg-primary",
  "border-primary",
  "text-destructive",
  "bg-destructive",
  "border-destructive",
  "text-foreground",
  "text-muted-foreground",
  "bg-muted",
  "bg-card",
  "bg-sidebar",
  "text-warning",
  "text-success",
  "--segment-active-bg",
  "--segment-active-fg",
  "--segment-inactive-fg",
];

/** Clickable, but deliberately not a button to look at.
 *
 * Named by the component rather than by its path, so moving the drawer does
 * not quietly turn its scrim into an offender. */
const NOT_A_VISIBLE_BUTTON = () => [
  // A full-screen scrim behind a drawer: clicking it closes, but it is a
  // dimmed overlay, not a control.
  fileDeclaring("TransactionPeekProvider"),
];

/** `.tsx` only — a `.ts` file has no markup to style. */
const markupFiles = () => sourceFiles().filter((f) => f.path.endsWith(".tsx"));

describe("everything clickable carries a colour", () => {
  it("the shared Button variants are visible at rest", () => {
    const button = sourceDeclaring("Button");

    // `secondary` was bg-background — the page's own colour behind a hairline.
    expect(button).not.toContain("bg-background hover:bg-muted");
    // `ghost` was hover-only, and a phone has no hover.
    expect(button).not.toMatch(/variant === "ghost" && "hover:bg-muted"/);

    for (const variant of ["primary", "secondary", "ghost"]) {
      const line = button.match(
        new RegExp(`variant === "${variant}" &&[\\s\\S]{0,140}`),
      )?.[0];
      expect(line, `${variant} has no style`).toBeTruthy();
      expect(
        COLOUR_TOKENS.some((token) => line!.includes(token)),
        `Button "${variant}" names no colour — it will read as plain text`,
      ).toBe(true);
    }
  });

  it("filter chips are visible whether or not they are active", () => {
    const chips = sourceDeclaring("FilterChip");
    // The inactive chip was a grey border around grey text, so a filter row
    // read as a row of disabled labels.
    expect(chips).not.toContain("border border-border text-muted-foreground");
    expect(chips).toContain("text-primary");
  });

  it("no hand-styled button reintroduces a colourless control", () => {
    const offenders: string[] = [];

    const excused = NOT_A_VISIBLE_BUTTON();
    for (const { path: relative, text: source } of markupFiles()) {
      if (excused.includes(relative)) continue;

      for (const match of source.matchAll(
        /<button\b[^>]*?className=(?:"([^"]*)"|\{cn\(\s*([^)]*))/g,
      )) {
        const classes = (match[1] ?? match[2] ?? "").replace(/\s+/g, " ");
        const styledLikeAControl = /rounded|border|bg-/.test(classes);
        if (!styledLikeAControl) continue;
        if (COLOUR_TOKENS.some((token) => classes.includes(token))) continue;
        // Tokens can arrive via a shared constant rather than a literal.
        if (/[A-Z_]{4,}/.test(classes)) continue;
        offenders.push(`${relative}: ${classes.slice(0, 80)}`);
      }
    }

    expect(
      offenders,
      [
        "These are styled like controls but name no colour, so they read as",
        "plain text or grey-on-grey. Use <Button> instead, or add a colour:",
        ...offenders,
      ].join("\n"),
    ).toEqual([]);
  });
});

describe("a field is not an action", () => {
  /** The colour rule has an edge, and this is it.
   *
   * The header search opens the command palette, so mechanically it is a
   * button — and when `secondary` became the solid primary fill, it turned
   * into a large blue slab in the header reading "Search…". It was obeying the
   * rule and still wrong: a solid fill says "press this and something
   * happens", where a search box says "you can type here".
   *
   * So it is styled like an Input. Pinned because the obvious tidy-up is to
   * put it back to <Button variant="secondary">, which looks like a
   * simplification and undoes this. */
  it("the header search reads as a search box, not a filled button", () => {
    const shell = sourceDeclaring("AppShell");
    const trigger = shell.match(
      /<button[\s\S]{0,900}?mizan:command-palette[\s\S]{0,400}?<\/button>/,
    )?.[0];
    expect(trigger, "the command-palette trigger is no longer a <button>").toBeTruthy();

    // Field clothing: same border and surface as Input.
    expect(trigger).toContain("border border-border");
    expect(trigger).toContain("bg-background");
    // Not action clothing.
    expect(trigger).not.toContain("bg-primary");
    expect(trigger).not.toContain("text-primary-foreground");
  });
});

describe("a chosen option looks chosen", () => {
  /** Segmented rows go through SegmentedControl. The FX dialog hand-rolled one
   * twice in a single file and both copies were colourless; a third would have
   * been too. Options are data, so a wallet or currency added later inherits
   * the styling without anyone having to remember to give it any. */
  it("segmented rows are not hand-rolled", () => {
    const offenders: string[] = [];
    const shared = fileDeclaring("SegmentedControl");
    for (const { path: relative, text: source } of markupFiles()) {
      if (relative === shared) continue;
      // The track: a bordered pill row holding the options.
      if (source.includes('rounded-md border border-border bg-muted/40 p-1')) {
        offenders.push(relative);
      }
    }
    expect(
      offenders,
      `These build their own segmented row — use <SegmentedControl>:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  /** Segmented controls — Buy/Sell/Spend, USD/EUR/GBP, filter chips — say
   * which option is active by filling it. The FX toggles filled with
   * `bg-background`: white on a grey track, so the selected mode carried no
   * colour and read as an unselected pill that happened to be lighter. */
  it("no selected state is painted in the page background", () => {
    const offenders: string[] = [];
    for (const { path: relative, text: source } of markupFiles()) {
      // The tell: a ternary whose truthy branch is the page background.
      for (const match of source.matchAll(
        /\?\s*"bg-background text-foreground[^"]*"/g,
      )) {
        offenders.push(`${relative}: ${match[0].slice(0, 60)}`);
      }
    }
    expect(
      offenders,
      [
        "A selected option filled with the page background reads as unselected.",
        "Fill it with bg-primary text-primary-foreground:",
        ...offenders,
      ].join("\n"),
    ).toEqual([]);
  });
});
