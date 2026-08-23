"use client";

/** Live membership sync — role changes apply globally; revoked access forces sign-out. */

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { useApiAuth } from "@/lib/api-auth";
import { clearMizanStorage, useEntity } from "@/lib/entity-context";
import {
  MEMBERSHIP_SYNC_POLL_MS,
  registerRoleChangeHandler,
  registerSessionRevokeHandler,
  resetSessionRevokeGuard,
  type SessionRevokeReason,
} from "@/lib/session-access";
import { useToast } from "@/lib/toast";
import { useEntityAccess } from "@/lib/use-entity-access";

function SessionAccessGuardClerk() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { isAuthReady } = useApiAuth();
  const { entityId, entitiesLoaded, refreshEntities } = useEntity();
  const { reload: reloadAccess } = useEntityAccess();
  const { toast } = useToast();
  const syncingRef = useRef(false);

  const forceSignOut = useCallback(
    async (_reason: SessionRevokeReason, message: string) => {
      try {
        clearMizanStorage();
        await signOut({ redirectUrl: "/sign-in" });
      } finally {
        router.replace(`/sign-in?reason=${encodeURIComponent(message)}`);
      }
    },
    [router, signOut],
  );

  useEffect(() => {
    registerSessionRevokeHandler(forceSignOut);
    return () => {
      registerSessionRevokeHandler(null);
      resetSessionRevokeGuard();
    };
  }, [forceSignOut]);

  useEffect(() => {
    registerRoleChangeHandler((_previous, _next, message) => {
      toast(message, "success");
    });
    return () => registerRoleChangeHandler(null);
  }, [toast]);

  const syncMembership = useCallback(async () => {
    if (!isAuthReady || !entityId || syncingRef.current) return;
    syncingRef.current = true;
    try {
      await reloadAccess({ silent: true });
      await refreshEntities({ silent: true });
    } finally {
      syncingRef.current = false;
    }
  }, [entityId, isAuthReady, refreshEntities, reloadAccess]);

  useEffect(() => {
    if (!isAuthReady || !entitiesLoaded || !entityId) return;

    void syncMembership();

    const onFocus = () => void syncMembership();
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncMembership();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    const timer = window.setInterval(() => {
      void syncMembership();
    }, MEMBERSHIP_SYNC_POLL_MS);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [entitiesLoaded, entityId, isAuthReady, syncMembership]);

  return null;
}

export function SessionAccessGuard() {
  const { clerkEnabled } = useApiAuth();
  if (!clerkEnabled) return null;
  return <SessionAccessGuardClerk />;
}
