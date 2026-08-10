// @vitest-environment jsdom

/** The Upload panel returns to an empty drop zone once the file is routed.
 *
 * On the Record desk the panel is `embedded` and never closes, so nothing
 * unmounts it and nothing else clears it — the only thing that puts it back to
 * its starting state is the reset inside Confirm. A stale file sitting there
 * after the invoice has been recorded reads as "it did not work", and the
 * obvious next move is to press Confirm again on a document already in.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();

vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock("@/lib/entity-context", () => ({
  useEntity: () => ({ entityId: "ent-1", actorId: "act-1" }),
}));
vi.mock("@/components/forms/recording-for-banner", () => ({
  RecordingForBanner: () => null,
}));

const { AddDocumentDialog } = await import(
  "@/components/forms/add-document-dialog"
);

function pdf(name = "38.pdf") {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

function drop(file: File) {
  const input = document.getElementById("add-document-file") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ document_type: "invoice", confidence: "high" });
});

afterEach(cleanup);

describe("the Upload panel after a file is routed", () => {
  it("clears the file and the detection result on Confirm", async () => {
    const onConfirm = vi.fn();
    render(
      <AddDocumentDialog embedded open onClose={() => undefined} onConfirm={onConfirm} />,
    );

    drop(pdf());
    await screen.findByText(/Supplier invoice/);
    expect(screen.getByText("38.pdf")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Confirm/ }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText("38.pdf")).toBeNull();
    });
    expect(screen.queryByText(/We read this as/)).toBeNull();
    // Back to the drop zone, not merely blank.
    expect(screen.getByText(/drag a file here/)).toBeTruthy();
  });

  /* The `finally` around `onConfirm` is deliberately not pinned here.
   *
   * Forcing it means throwing from the handler, and React 19 reports an error
   * thrown in an event handler to `window` as well as propagating it — so the
   * test passed while vitest logged an unhandled error on every run. A suite
   * that always prints one error is a suite where the next real one is
   * invisible, which costs more than this line of coverage is worth. Pinning
   * it needs `createRoot`'s `onUncaughtError`, which the test renderer does
   * not expose. */

  it("takes a second file after the first one is routed", async () => {
    // The reason the reset matters: the panel stays mounted, so whatever it
    // is left in is the state the next upload starts from.
    const onConfirm = vi.fn();
    render(
      <AddDocumentDialog embedded open onClose={() => undefined} onConfirm={onConfirm} />,
    );

    drop(pdf("38.pdf"));
    await screen.findByText(/Supplier invoice/);
    fireEvent.click(screen.getByRole("button", { name: /Confirm/ }));
    await waitFor(() => expect(screen.queryByText("38.pdf")).toBeNull());

    apiFetch.mockResolvedValue({
      document_type: "expense_receipt",
      confidence: "high",
    });
    drop(pdf("40.pdf"));

    await screen.findByText(/Expense receipt/);
    expect(screen.getByText("40.pdf")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Confirm/ }));
    expect(onConfirm).toHaveBeenCalledTimes(2);
    expect(onConfirm.mock.calls[1]?.[0]).toBe("expense_receipt");
  });
});
