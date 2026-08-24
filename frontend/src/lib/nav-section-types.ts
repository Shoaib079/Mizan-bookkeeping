/** Types for tab sections + route reachability registry. */

export type NavTab = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  /** Hidden when delivery module is off for the entity. */
  requiresDelivery?: boolean;
  /** Hidden when role lacks financial_reports:read. */
  requiresFinancialReports?: boolean;
};

export type NavSectionId =
  | "sales"
  | "banking"
  | "suppliers"
  | "customers"
  | "staff"
  | "partners"
  | "review"
  | "delivery";

export type NavSection = {
  id: NavSectionId;
  /** Sidebar row href — parent highlight when any tab or drill-down matches. */
  sidebarHref: string;
  tabs: NavTab[];
};

export type RouteEntryKind =
  | "sidebar"
  | "tab"
  | "reports-card"
  | "drill-down"
  | "auth"
  | "redirect"
  | "page";

export type PageBackLink = {
  href: string;
  label: string;
};
