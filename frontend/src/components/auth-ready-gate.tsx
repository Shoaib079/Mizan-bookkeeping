"use client";

import { usePathname } from "next/navigation";

import { useApiAuth } from "@/lib/api-auth";

export function isPublicAuthRoute(pathname: string): boolean {
  return pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
}

export function shouldBlockUntilAuthReady(params: {
  clerkEnabled: boolean;
  isAuthReady: boolean;
  pathname: string;
}): boolean {
  if (!params.clerkEnabled || params.isAuthReady) return false;
  return !isPublicAuthRoute(params.pathname);
}

export function AuthReadyGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { clerkEnabled, isAuthReady } = useApiAuth();

  if (
    shouldBlockUntilAuthReady({ clerkEnabled, isAuthReady, pathname })
  ) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background"
        aria-busy
        aria-label="Loading session"
      >
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return children;
}
