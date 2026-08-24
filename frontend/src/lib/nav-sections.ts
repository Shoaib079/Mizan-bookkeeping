/** Tab sections + route reachability registry (IA audit v0.71.9). */

import {
  LEGACY_UPLOADS_REDIRECT,
  LEGACY_UPLOADS_REDIRECTS,
} from "@/lib/intent-nav";
import { LEGACY_REVIEW_REDIRECTS } from "@/lib/review-routes";
import { LEGACY_SETUP_REDIRECTS } from "@/lib/setup-routes";

export {
  LEGACY_REVIEW_REDIRECTS,
  LEGACY_SETUP_REDIRECTS,
  LEGACY_UPLOADS_REDIRECT,
  LEGACY_UPLOADS_REDIRECTS,
};

export type {
  NavTab,
  NavSectionId,
  NavSection,
  RouteEntryKind,
  PageBackLink,
} from "@/lib/nav-section-types";

export { NAV_SECTIONS } from "@/lib/nav-sections-data";

export {
  SIDEBAR_HIDDEN_HREFS,
  REPORTS_CARD_HREFS,
  LEGACY_BALANCE_REDIRECTS,
  REGISTERED_PAGE_ROUTES,
} from "@/lib/nav-route-registry";

export {
  navSectionForPathname,
  navSectionById,
  sidebarHrefActiveForPathname,
  pageTitleForPathname,
  backLinkForPathname,
} from "@/lib/nav-path-helpers";
