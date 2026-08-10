// @vitest-environment jsdom

/** One drop, one handler.
 *
 * `DropAnywhere` listens on `window`, so it sees drops aimed at controls on the
 * page as well as drops on empty space — the event bubbles, and its own overlay
 * is `pointer-events-none` so the real target is whatever is underneath. Both
 * acting took a single drop twice: the Record desk's Upload panel detected the
 * file and offered Confirm, while a dialog opened on top of it holding a second
 * copy. Confirming in the dialog recorded the invoice and left the panel below
 * still showing the file with a live Confirm button — which is not a leftover,
 * it is a second posting waiting to be clicked.
 *
 * Nothing in either file's types connects them: the contract is a `data-`
 * attribute one side writes and the other reads, so it is only real if
 * something renders both.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DropAnywhere, landedInADropZone } from "@/components/drop-anywhere";
import { FileUpload } from "@/components/ui/file-upload";

function pdf(name = "38.pdf") {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

/** jsdom has no DataTransfer, and `types` must say "Files" or both sides skip. */
function dropEvent(file: File) {
  return { dataTransfer: { files: [file], types: ["Files"], items: [] } };
}

afterEach(cleanup);

describe("a drop that lands in a drop zone", () => {
  it("goes to that control and not to the window handler", () => {
    const onWindowFile = vi.fn();
    const onFileChange = vi.fn();
    render(
      <>
        <DropAnywhere onFile={onWindowFile} />
        <FileUpload file={null} onFileChange={onFileChange} />
      </>,
    );

    const zone = screen.getByText(/drag a file here/);
    fireEvent.drop(zone, dropEvent(pdf()));

    expect(onFileChange).toHaveBeenCalledTimes(1);
    expect(onFileChange.mock.calls[0]?.[0]?.name).toBe("38.pdf");
    expect(onWindowFile).not.toHaveBeenCalled();
  });

  it("still reaches the control once it is already holding a file", () => {
    // The handlers sit on the wrapper, so this state is a drop zone too.
    // Were it not, the window handler would skip it as owned and the control
    // would ignore it — a dead rectangle, which is worse than either.
    const onWindowFile = vi.fn();
    const onFileChange = vi.fn();
    render(
      <>
        <DropAnywhere onFile={onWindowFile} />
        <FileUpload file={pdf("38.pdf")} onFileChange={onFileChange} />
      </>,
    );

    fireEvent.drop(screen.getByText("38.pdf"), dropEvent(pdf("40.pdf")));

    expect(onFileChange.mock.calls[0]?.[0]?.name).toBe("40.pdf");
    expect(onWindowFile).not.toHaveBeenCalled();
  });

  it("a disabled control is not a drop zone, so the window still takes it", () => {
    // Otherwise disabling a file field would quietly turn its rectangle into
    // the one place on the page a drop does nothing at all.
    const onWindowFile = vi.fn();
    render(
      <>
        <DropAnywhere onFile={onWindowFile} />
        <FileUpload file={null} disabled onFileChange={() => undefined} />
      </>,
    );

    fireEvent.drop(screen.getByText(/drag a file here/), dropEvent(pdf()));

    expect(onWindowFile).toHaveBeenCalledTimes(1);
  });
});

describe("a drop on the page at large", () => {
  it("reaches the window handler", () => {
    // Guard the guard: if this stopped working the tests above would pass by
    // testing nothing, and drop-anywhere would be quietly dead.
    const onWindowFile = vi.fn();
    render(
      <>
        <DropAnywhere onFile={onWindowFile} />
        <div data-testid="page">Some page</div>
      </>,
    );

    fireEvent.drop(screen.getByTestId("page"), dropEvent(pdf()));

    expect(onWindowFile).toHaveBeenCalledTimes(1);
    expect(onWindowFile.mock.calls[0]?.[0]?.name).toBe("38.pdf");
  });

  it("takes the overlay down even when the drop was owned elsewhere", () => {
    // No dragleave follows a drop. Returning early before the reset left the
    // full-window overlay covering the app until the next drag.
    render(
      <>
        <DropAnywhere onFile={() => undefined} />
        <FileUpload file={null} onFileChange={() => undefined} />
      </>,
    );

    const zone = screen.getByText(/drag a file here/);
    // Dispatched on the body so it bubbles to the window listener — the same
    // path a real drag takes, without depending on how fireEvent treats window.
    fireEvent.dragEnter(document.body, dropEvent(pdf()));
    expect(screen.queryByText(/Drop the document anywhere/)).not.toBeNull();

    fireEvent.drop(zone, dropEvent(pdf()));
    expect(screen.queryByText(/Drop the document anywhere/)).toBeNull();
  });
});

describe("landedInADropZone", () => {
  it("is false for a target that is not an element", () => {
    expect(landedInADropZone(null)).toBe(false);
    expect(landedInADropZone(window)).toBe(false);
  });
});
