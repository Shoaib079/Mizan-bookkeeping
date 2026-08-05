"use client";

/** The shape every settings and setup page takes (DESIGN_ARCHETYPES §7).
 *
 * `PageHeader` + `FormSection` groups + a save bar that stays reachable. The
 * settings pages had each picked their own card padding (p-5 against the p-4
 * every other card in the app uses) and their own idea of where Save lives —
 * some at the bottom of a long scroll, some per-section.
 *
 * The width is capped: a form field stretched across a wide monitor is harder
 * to read, not easier, and every one of these pages had already capped itself
 * at a different value. */

import { PageHeader } from "@/components/page/page-header";
import type { OverflowMenuItem } from "@/components/ui/overflow-menu";
import { PageSkeleton } from "@/components/ui/skeleton";
import { MOBILE_TAB_BAR_OFFSET } from "@/lib/mobile-shell";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  overflowActions?: OverflowMenuItem[];

  /** `FormSection`s. */
  children: React.ReactNode;
  /** Save/cancel, pinned to the bottom of the viewport while editing. */
  saveBar?: React.ReactNode;

  /** Forms read better narrow; `wide` is for two-column setup screens. */
  width?: "default" | "wide" | "full";
  loading?: boolean;
  error?: string | null;
  className?: string;
};

const WIDTHS = {
  default: "max-w-2xl",
  wide: "max-w-5xl",
  full: "",
} as const;

export function FormPage({
  title,
  meta,
  actions,
  overflowActions,
  children,
  saveBar,
  width = "default",
  loading = false,
  error,
  className,
}: Props) {
  const isMobile = useIsMobileShell();
  return (
    <div className={className}>
      <PageHeader
        title={title}
        meta={meta}
        actions={actions}
        overflowActions={overflowActions}
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {loading ? (
        <PageSkeleton />
      ) : (
        <div className={cn("space-y-6", WIDTHS[width])}>{children}</div>
      )}

      {saveBar && (
        // Sticky rather than parked at the bottom of a long form: on Settings
        // you could scroll past Save and not know it was there.
        //
        // On mobile it has to be lifted clear of the tab bar. A sticky element
        // offset to zero resolves against the scrollport's padding box, and
        // <main> runs underneath the fixed tabs — so the bar came to rest
        // behind them, and lost on z-index too (10 against 30). Save was
        // unreachable on every form in the app, and the desktop fix above is
        // what created it.
        <div
          className={cn(
            "sticky z-10 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur",
            isMobile ? MOBILE_TAB_BAR_OFFSET : "bottom-0",
          )}
        >
          {saveBar}
        </div>
      )}
    </div>
  );
}

/** One titled group of fields. */
export function FormSection({
  title,
  hint,
  actions,
  children,
  className,
}: {
  title?: string;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {hint && (
              <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
            )}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
