/** Drop-anywhere: the parts that are wrong silently.
 *
 * A source scan rather than a render test — the behaviour lives in window
 * listeners, and the two failures that matter leave no trace when they
 * happen: the browser navigating away from the app, and an overlay that
 * flickers as the pointer crosses each child element.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  join(process.cwd(), "src", "components", "drop-anywhere.tsx"),
  "utf8",
);
const PROVIDER = readFileSync(
  join(process.cwd(), "src", "components", "quick-actions.tsx"),
  "utf8",
);

describe("DropAnywhere", () => {
  it("cancels the browser's own drop handling", () => {
    // Without preventDefault on BOTH dragover and drop, letting go of a PDF
    // makes the browser open the file — navigating away from the app, with
    // any half-filled form on screen gone with it.
    const dragOver = SOURCE.slice(
      SOURCE.indexOf("function onDragOver"),
      SOURCE.indexOf("function onDragLeave"),
    );
    const drop = SOURCE.slice(
      SOURCE.indexOf("function onDrop"),
      SOURCE.indexOf("window.addEventListener"),
    );
    expect(dragOver).toContain("preventDefault");
    expect(drop).toContain("preventDefault");
  });

  it("counts enter and leave rather than trusting the last one", () => {
    // dragenter/dragleave fire for every element crossed, so a plain
    // `setDragging(false)` on leave makes the overlay strobe across a page.
    expect(SOURCE).toContain("depth.current += 1");
    expect(SOURCE).toContain("depth.current - 1");
  });

  it("ignores drags that carry no files", () => {
    // Selecting text and dragging it should not throw up a file overlay.
    expect(SOURCE).toContain('includes("Files")');
  });

  it("removes its listeners", () => {
    const removals = [...SOURCE.matchAll(/removeEventListener/g)];
    const additions = [...SOURCE.matchAll(/window\.addEventListener/g)];
    expect(removals.length).toBe(additions.length);
  });

  it("lets the overlay through to the drop", () => {
    // The overlay sits over the whole window while a file is in flight. If it
    // captured pointer events the drop would land on a div with no handler
    // and nothing would happen.
    expect(SOURCE).toContain("pointer-events-none");
  });

  it("stands down while a record dialog is open", () => {
    // That dialog has its own file field; two drop targets fighting over one
    // file is how a drop silently does the wrong thing.
    expect(PROVIDER).toContain("active === null");
  });

  it("is wired to the detecting flow, not to one document type", () => {
    // Dropped files can be any of four kinds; guessing invoice would put a Z
    // report into the invoice reader.
    expect(PROVIDER).toContain('openRecordActionWithFile("addDocument", file)');
  });
});
