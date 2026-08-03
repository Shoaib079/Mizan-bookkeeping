"use client";

import { useSearchParams } from "next/navigation";

export function SignInReasonBanner() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason")?.trim();
  if (!reason) return null;

  return (
    <div
      role="alert"
      className="mb-4 max-w-md rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {reason}
    </div>
  );
}
