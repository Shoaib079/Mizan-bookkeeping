"use client";

/** Redirects cashiers away from routes outside their daily-transaction scope. */

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { canAccessAppPath, canAccessThemePreview, hasGrant } from "@/lib/entity-access";
import { useEntityAccess } from "@/lib/use-entity-access";

export function RouteAccessGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const { grants, membershipSettled, role } = useEntityAccess();

  useEffect(() => {
    if (!membershipSettled || !pathname) return;
    const path = pathname.split("?")[0]?.split("#")[0] ?? "/";
    if (path === "/preview" && !canAccessThemePreview(role)) {
      router.replace(hasGrant(grants, "nav:record") ? "/record" : "/");
      return;
    }
    if (canAccessAppPath(grants, pathname)) return;
    router.replace(hasGrant(grants, "nav:record") ? "/record" : "/");
  }, [membershipSettled, pathname, grants, role, router]);

  return null;
}
