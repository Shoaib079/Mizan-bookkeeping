"use client";

/** Drop a document anywhere on the window, not onto a particular rectangle.
 *
 * Dragging a file from the desktop and having to land it inside a small dashed
 * box is a game of aim. The whole window is the target: drag a file in and the
 * page says so; let go anywhere and it goes to the same detection the Add
 * document dialog uses, which decides whether it is an invoice, a receipt, a
 * bank statement or a Z report.
 *
 * Two details that are easy to get wrong and invisible when wrong:
 *
 * - `dragenter`/`dragleave` fire for every element the pointer crosses, so a
 *   naive `dragleave` handler makes the overlay flicker as the cursor moves
 *   over each child. Counted instead: the overlay closes when the count is
 *   back to zero, meaning the pointer has actually left the window.
 * - Both `dragover` *and* `dragenter` must call `preventDefault`, or the
 *   browser keeps its own drop behaviour and opens the file in a new tab
 *   instead — replacing the app.
 */

import { FileUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  /** Called with the dropped file. */
  onFile: (file: File) => void;
  /** When false, drops are left to whatever is already on screen. */
  enabled?: boolean;
};

/** Is this drag carrying files, rather than selected text or a link? */
function carriesFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}

export function DropAnywhere({ onFile, enabled = true }: Props) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const reset = useCallback(() => {
    depth.current = 0;
    setDragging(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }

    function onDragEnter(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    }

    function onDragOver(event: DragEvent) {
      if (!carriesFiles(event)) return;
      // Without this the browser navigates to the file on drop.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }

    function onDragLeave(event: DragEvent) {
      if (!carriesFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    }

    function onDrop(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      reset();
      const file = event.dataTransfer?.files?.[0];
      // One file: every flow behind this takes a single document, and
      // silently keeping the first of five would be worse than taking one.
      if (file) onFile(file);
    }

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [enabled, onFile, reset]);

  if (!dragging) return null;

  return (
    <div
      // Above the tab bar and every dialog: the drop is already happening, and
      // an overlay the file appears to land behind reads as nothing happening.
      className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
      aria-hidden
    >
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary bg-card px-8 py-10 text-center shadow-lg">
        <FileUp className="h-10 w-10 text-primary" aria-hidden />
        <p className="text-base font-semibold text-foreground">
          Drop the document anywhere
        </p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Invoice, receipt, bank statement or Z report — we work out which and
          send it to the right place.
        </p>
      </div>
    </div>
  );
}
