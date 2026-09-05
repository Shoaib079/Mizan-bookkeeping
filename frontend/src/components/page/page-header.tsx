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
import { useRegisterMobileShellTitle } from "@/lib/mobile-shell-title";
import { cn } from "@/lib/utils";
import { DESKTOP_SHELL_ONLY, MOBILE_SHELL_ONLY } from "@/lib/mobile-shell";

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
  /** Compact balance sticker — right of actions on desktop; under the name on mobile. */
  aside?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  titleAction,
  meta,
  primaryAction,
  actions,
  overflowActions,
  aside,
  className,
}: Props) {
  // Phone top bar shows this string once — do not paint a second H1 under it.
  useRegisterMobileShellTitle(title);

  const hasActions =
    Boolean(primaryAction) ||
    Boolean(actions) ||
    Boolean(overflowActions?.length);
  /** Title-only headers collapse on phone; meta / actions / sticker stay. */
  const chromeOnly =
    !meta && !hasActions && !aside && !titleAction;

  return (
    <header
      data-testid="page-header"
      className={cn(
        "mb-5 border-b border-border pb-4",
        chromeOnly && "max-[819px]:hidden",
        className,
      )}
    >
      <div className="flex flex-col gap-3 min-[820px]:flex-row min-[820px]:items-start min-[820px]:justify-between min-[820px]:gap-4">
        <div className="min-w-0 flex-1">
          {/* One bold title only — no muted eyebrow above the H1 (accepted-live).
           * On phone the visible title lives in MobileTopBar; keep H1 for a11y. */}
          <div className="flex min-w-0 items-center gap-2">
            <h1
              data-testid="page-header-title"
              className="truncate text-xl font-semibold max-[819px]:sr-only"
            >
              {title}
            </h1>
            {titleAction}
          </div>
          {meta && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {meta}
            </div>
          )}
          {/* Mobile shell: sticker stacks under the name. */}
          {aside ? (
            <div className={cn("mt-3", MOBILE_SHELL_ONLY)}>{aside}</div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 min-[820px]:items-end">
          {hasActions && (
            <div className="flex flex-wrap items-center gap-2">
              {actions}
              {primaryAction}
              {overflowActions && overflowActions.length > 0 && (
                <OverflowMenu items={overflowActions} />
              )}
            </div>
          )}
          {/* Desktop shell: sticker under the action row, right-aligned. */}
          {aside ? (
            <div className={DESKTOP_SHELL_ONLY}>{aside}</div>
          ) : null}
        </div>
      </div>
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
