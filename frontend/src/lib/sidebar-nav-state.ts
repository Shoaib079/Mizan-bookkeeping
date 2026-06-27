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

/** Active collapsible group for a route — at most one, or none (e.g. Dashboard). */
export function sidebarGroupStateForPathname(
  pathname: string,
  settings: EntityNavSettings,
): SidebarGroupState {
  for (const label of COLLAPSIBLE_NAV_GROUP_LABELS) {
    if (navGroupContainsPathname(label, pathname, settings)) {
      return { [label]: true };
    }
  }
  return {};
}

/** Initial open group: current route wins; on Dashboard restore single persisted group. */
export function resolveSidebarGroupState(
  pathname: string,
  settings: EntityNavSettings,
  stored: SidebarGroupState = readSidebarGroupState(),
): SidebarGroupState {
  const fromRoute = sidebarGroupStateForPathname(pathname, settings);
  if (Object.keys(fromRoute).length > 0) {
    return fromRoute;
  }
  const openStored = Object.entries(stored).find(([, open]) => open);
  return openStored ? { [openStored[0]]: true } : {};
}

/** Accordion toggle — only one section open; re-click closes all. */
export function toggleSidebarGroupState(
  state: SidebarGroupState,
  groupLabel: string,
): SidebarGroupState {
  if (state[groupLabel]) {
    return {};
  }
  return { [groupLabel]: true };
}

export function openSidebarGroupCount(state: SidebarGroupState): number {
  return Object.values(state).filter(Boolean).length;
}
