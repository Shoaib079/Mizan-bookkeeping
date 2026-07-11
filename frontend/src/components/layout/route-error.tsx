"use client";

/** Shared route-segment error boundary body (audit C2a). */

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
  context?: string;
};

export function RouteError({ error, reset, context = "this page" }: Props) {
  useEffect(() => {
    // Surface in console for bug reports; no external reporting wired yet.
    console.error(`[mizan] route error on ${context}:`, error);
  }, [error, context]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-16 text-center">
      <AlertTriangle className="size-8 text-warning" aria-hidden />
      <h2 className="text-base font-semibold">Something went wrong loading {context}</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Your data is safe — this is a display error, nothing was posted or
        changed. Try again, or switch pages and come back.
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
