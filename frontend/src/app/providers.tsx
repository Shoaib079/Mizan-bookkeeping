"use client";

import { ClerkProvider } from "@clerk/nextjs";

import { ApiAuthProvider } from "@/lib/api-auth";
import { EntityProvider } from "@/lib/entity-context";

const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function Providers({ children }: { children: React.ReactNode }) {
  const inner = (
    <ApiAuthProvider clerkEnabled={Boolean(clerkPubKey)}>
      <EntityProvider>{children}</EntityProvider>
    </ApiAuthProvider>
  );

  if (!clerkPubKey) return inner;

  return <ClerkProvider publishableKey={clerkPubKey}>{inner}</ClerkProvider>;
}
