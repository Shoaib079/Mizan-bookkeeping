/** Collapsible sidebar group open/closed state (DESIGN_SYSTEM §6). */

import {
  filterNavItemsByEntitySettings,
  isNavItemActive,
  navGroups,
  type EntityNavSettings,
} from "@/lib/app-routes";

export const SIDEBAR_NAV_STORAGE_KEY = "mizan.sidebar.nav.groups";

export type SidebarGroupState = Record<string, boolean>;

export const COLLAPSIBLE_NAV_GROUP_LABELS = navGroups
  .map((group) => group.label)
  .filter((label) => label !== "Overview");

export function readSidebarGroupState(): SidebarGroupState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SIDEBAR_NAV_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as SidebarGroupState;
  } catch {
    return {};
  }
}

export function writeSidebarGroupState(state: SidebarGroupState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIDEBAR_NAV_STORAGE_KEY, JSON.stringify(state));
}

export function navGroupContainsPathname(
  groupLabel: string,
  pathname: string,
  settings: EntityNavSettings,
): boolean {
  const group = navGroups.find((entry) => entry.label === groupLabel);
  if (!group) return false;
  const items = filterNavItemsByEntitySettings(group.items, settings);
  return items.some((item) => isNavItemActive(pathname, item));
}

/** Merge persisted toggles with auto-expand for the active route's group. */
export function resolveSidebarGroupState(
  pathname: string,
  settings: EntityNavSettings,
  stored: SidebarGroupState = readSidebarGroupState(),
): SidebarGroupState {
  const state: SidebarGroupState = {};
  for (const label of COLLAPSIBLE_NAV_GROUP_LABELS) {
    if (navGroupContainsPathname(label, pathname, settings)) {
      state[label] = true;
    } else {
      state[label] = stored[label] ?? false;
    }
  }
  return state;
}

export function toggleSidebarGroupState(
  state: SidebarGroupState,
  groupLabel: string,
): SidebarGroupState {
  return { ...state, [groupLabel]: !state[groupLabel] };
}
