import { redirect } from "next/navigation";

import { LEGACY_SETUP_REDIRECTS } from "@/lib/setup-routes";

export function redirectLegacySetup(path: keyof typeof LEGACY_SETUP_REDIRECTS) {
  redirect(LEGACY_SETUP_REDIRECTS[path]);
}
