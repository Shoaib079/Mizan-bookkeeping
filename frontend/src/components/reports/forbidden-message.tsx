"use client";

import { ApiError } from "@/lib/api";

export function isForbiddenError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

export function ForbiddenMessage({ context = "report" }: { context?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Access restricted</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        You don&apos;t have permission to view this {context}. Cashier accounts
        cannot open financial statements — ask your restaurant owner for access.
      </p>
    </div>
  );
}
