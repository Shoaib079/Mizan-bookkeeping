"use client";

import { ClerkProvider } from "@clerk/nextjs";

import { ApiAuthProvider } from "@/lib/api-auth";
import { FirstRunOnboardingModal } from "@/components/first-run-onboarding-modal";
import { EntityProvider } from "@/lib/entity-context";
import { ToastProvider } from "@/lib/toast";
import { UnsavedWorkProvider } from "@/lib/unsaved-work";

const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function Providers({ children }: { children: React.ReactNode }) {
  const inner = (
    <ApiAuthProvider clerkEnabled={Boolean(clerkPubKey)}>
      <EntityProvider>
        <UnsavedWorkProvider>
          <ToastProvider>
            <FirstRunOnboardingModal />
            {children}
          </ToastProvider>
        </UnsavedWorkProvider>
      </EntityProvider>
    </ApiAuthProvider>
  );

  if (!clerkPubKey) return inner;

  return <ClerkProvider publishableKey={clerkPubKey}>{inner}</ClerkProvider>;
}
