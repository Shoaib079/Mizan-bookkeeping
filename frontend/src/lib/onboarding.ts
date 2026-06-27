/** First-run onboarding checklist — Phase 12 Slice 12.0. */

import { hasPermission } from "@/lib/entity-access";
import type { EntityRole } from "@/lib/settings-types";

export type OnboardingState = {
  chartSeeded: boolean;
  openingBalancesPosted: boolean;
  staffInvited: boolean;
  firstDayRecorded: boolean;
};

export type OnboardingStepId =
  | "chart"
  | "opening_balances"
  | "invite_staff"
  | "first_day";

export type OnboardingStep = {
  id: OnboardingStepId;
  label: string;
  href: string;
  done: boolean;
};

/** Setup checklist is for owner/partner roles with write access (Slice 11.21). */
export function shouldShowOnboardingChecklist(role: EntityRole): boolean {
  return role === "owner" || role === "partner";
}

export function buildOnboardingSteps(
  state: OnboardingState,
  role: EntityRole,
): OnboardingStep[] {
  const steps: OnboardingStep[] = [
    {
      id: "chart",
      label: "Seed chart of accounts",
      href: "/settings/entity",
      done: state.chartSeeded,
    },
    {
      id: "opening_balances",
      label: "Post opening balances",
      href: "/settings/opening-balances",
      done: state.openingBalancesPosted,
    },
  ];

  if (hasPermission(role, "admin:manage_members")) {
    steps.push({
      id: "invite_staff",
      label: "Invite staff",
      href: "/settings/members",
      done: state.staffInvited,
    });
  }

  steps.push({
    id: "first_day",
    label: "Record first day of sales",
    href: "/sales",
    done: state.firstDayRecorded,
  });

  return steps;
}

export function isOnboardingComplete(steps: OnboardingStep[]): boolean {
  return steps.length > 0 && steps.every((step) => step.done);
}

export function onboardingDismissStorageKey(entityId: string): string {
  return `mizan.onboarding.dismissed.${entityId}`;
}

export function readOnboardingDismissed(entityId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(onboardingDismissStorageKey(entityId)) === "true";
}

export function writeOnboardingDismissed(entityId: string): void {
  window.localStorage.setItem(onboardingDismissStorageKey(entityId), "true");
}

export type PaginatedTotal = {
  total: number;
};

/** Derive checklist progress from existing list endpoints (no new backend). */
export function deriveOnboardingState(responses: {
  chart: PaginatedTotal;
  openingBalance: PaginatedTotal;
  members: PaginatedTotal;
  dailySummaries: PaginatedTotal;
}): OnboardingState {
  return {
    chartSeeded: responses.chart.total > 0,
    openingBalancesPosted: responses.openingBalance.total > 0,
    staffInvited: responses.members.total > 1,
    firstDayRecorded: responses.dailySummaries.total > 0,
  };
}
