"use client";

/** One header for every page (DESIGN_ARCHETYPES §1).
 *
 * Title, the facts that identify the thing, and the actions you can take on
 * it — always in the same place, so the eye never has to re-learn a page. */

import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
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

/** "Edit", beside the name it edits — the standard `titleAction`.
 *
 * Every entity detail page had this buried in the overflow menu, where it read
 * as a rare or advanced operation. Renaming a supplier is neither. Shared
 * rather than written out four times, so the four pages cannot drift into
 * different icons, sizes or wording for the same act.
 *
 * Ghost, not filled: it sits next to a heading, and a solid button there
 * competes with the page's actual primary action.
 */
export function EditTitleButton({
  label = "Edit",
  onClick,
}: {
  /** Overridden only where "Edit" alone would be ambiguous. */
  label?: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-8 shrink-0 gap-1.5 px-2"
      onClick={onClick}
    >
      <Pencil className="size-4" />
      {label}
    </Button>
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
