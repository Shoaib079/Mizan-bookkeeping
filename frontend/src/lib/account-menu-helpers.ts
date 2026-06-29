/** Account menu helpers — testable logic for Slice 12.0b. */

import { hasPermission } from "@/lib/entity-access";
import { shouldShowOnboardingChecklist } from "@/lib/onboarding";
import type { EntityRole } from "@/lib/settings-types";

export type AccountMenuLink = {
  href: string;
  label: string;
};

export function switchConfirmMessage(fromName: string, toName: string): string {
  return `Switch to ${toName}? You're currently in ${fromName}.`;
}

export function unsavedWorkWarningMessage(): string {
  return "You have unsaved changes. Leave anyway?";
}

export function accountMenuAdminLinks(role: EntityRole): AccountMenuLink[] {
  const links: AccountMenuLink[] = [];

  if (shouldShowOnboardingChecklist(role)) {
    links.push(
      { href: "/setup/restaurant", label: "Restaurant settings" },
      { href: "/setup/opening-balances", label: "Opening balances" },
    );
  }

  if (hasPermission(role, "admin:manage_members")) {
    links.push({ href: "/setup/members", label: "Members & roles" });
  }

  if (role === "owner") {
    links.push({ href: "/setup/expense-items", label: "Expense items" });
  }

  return links;
}

export function recordingForLabel(restaurantName: string): string {
  return `Recording for: ${restaurantName}`;
}

export function devModeIdentityLabel(): string {
  return "Dev mode — not signed in";
}
