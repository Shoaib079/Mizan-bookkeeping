/** Local-only navigation for `/preview` — never touches Next.js router. */

export type PreviewTab = "home" | "sales" | "balances" | "record" | "more";

export type PreviewStack =
  | { kind: "root" }
  | { kind: "sale-detail"; saleId: string }
  | { kind: "supplier-detail" }
  | { kind: "customer-detail" };

export const PREVIEW_TABS: readonly PreviewTab[] = [
  "home",
  "sales",
  "balances",
  "record",
  "more",
] as const;

/**
 * Switch the preview tab in local state only.
 * The optional `router` argument exists so tests can prove we never call it.
 */
export function selectPreviewTab(
  tab: PreviewTab,
  setTab: (next: PreviewTab) => void,
  router?: { push: (href: string) => void },
): void {
  void router;
  setTab(tab);
}

export function previewTabHref(tab: PreviewTab): string {
  if (tab === "home") return "/";
  return `/${tab}`;
}
