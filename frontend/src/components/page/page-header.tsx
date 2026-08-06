"use client";

/** One header for every page (DESIGN_ARCHETYPES §1).
 *
 * Title, the facts that identify the thing, and the actions you can take on
 * it — always in the same place, so the eye never has to re-learn a page. */

import {
  OverflowMenu,
  type OverflowMenuItem,
} from "@/components/ui/overflow-menu";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  /** Sits beside the title, for acting on the *name* rather than the record.
   *
   * "Edit customer" belongs here rather than in the overflow: it changes the
   * heading you are looking at, so putting it next to that heading says what
   * it edits. The overflow is for things you rarely do; renaming is not rare,
   * and hiding it behind "⋯" made it feel like an advanced operation. */
  titleAction?: React.ReactNode;
  /** Small facts under the title: badges, VKN, pay currency, share %. */
  meta?: React.ReactNode;
  /** Rendered first, filled style — the action this page is for. */
  primaryAction?: React.ReactNode;
  /** Outline buttons beside it. */
  actions?: React.ReactNode;
  /** Collapsed behind "⋯" — rare or destructive things. */
  overflowActions?: OverflowMenuItem[];
  className?: string;
};

export function PageHeader({
  title,
  titleAction,
  meta,
  primaryAction,
  actions,
  overflowActions,
  className,
}: Props) {
  const hasActions =
    Boolean(primaryAction) ||
    Boolean(actions) ||
    Boolean(overflowActions?.length);

  return (
    <header
      className={cn(
        "mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-border pb-4",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-xl font-semibold">{title}</h1>
          {titleAction}
        </div>
        {meta && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {meta}
          </div>
        )}
      </div>

      {hasActions && (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {primaryAction}
          {overflowActions && overflowActions.length > 0 && (
            <OverflowMenu items={overflowActions} />
          )}
        </div>
      )}
    </header>
  );
}

/** Dot-separated facts — the standard meta row content. */
export function MetaFacts({ items }: { items: React.ReactNode[] }) {
  const shown = items.filter(Boolean);
  return (
    <>
      {shown.map((item, index) => (
        <span key={index} className="flex items-center gap-2">
          {index > 0 && <span aria-hidden className="text-muted-foreground/50">·</span>}
          {item}
        </span>
      ))}
    </>
  );
}
