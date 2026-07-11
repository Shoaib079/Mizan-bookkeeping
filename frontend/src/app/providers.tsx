"use client";

import { ClerkProvider } from "@clerk/nextjs";

import { AuthReadyGate } from "@/components/auth-ready-gate";
import { FirstRunOnboardingModal } from "@/components/first-run-onboarding-modal";
import { QuickActionsProvider } from "@/components/quick-actions";
import { ApiAuthProvider } from "@/lib/api-auth";
import { EntityProvider } from "@/lib/entity-context";
import { QueryProvider } from "@/lib/query-client";
import { ToastProvider } from "@/lib/toast";
import { UnsavedWorkProvider } from "@/lib/unsaved-work";
import { EntityAccessProvider } from "@/lib/use-entity-access";

const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function Providers({ children }: { children: React.ReactNode }) {
  const inner = (
    <QueryProvider>
      <ApiAuthProvider clerkEnabled={Boolean(clerkPubKey)}>
        <EntityProvider>
          <EntityAccessProvider>
            <UnsavedWorkProvider>
              <ToastProvider>
                <QuickActionsProvider>
                  <FirstRunOnboardingModal />
                  <AuthReadyGate>{children}</AuthReadyGate>
                </QuickActionsProvider>
              </ToastProvider>
            </UnsavedWorkProvider>
          </EntityAccessProvider>
        </EntityProvider>
      </ApiAuthProvider>
    </QueryProvider>
  );

  if (!clerkPubKey) return inner;

  return <ClerkProvider publishableKey={clerkPubKey}>{inner}</ClerkProvider>;
}
