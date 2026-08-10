"use client";

/** The buttons the Record desk is made of.
 *
 * Four presentational components, no state of their own, lifted out of
 * `record-desk.tsx` when a two-line accessibility fix pushed that file past
 * the size it was already too big at. They belong together: each is a button
 * with an icon and a label, and the desk itself is about which of them to show.
 */

import { cn } from "@/lib/utils";
import { type RecordActionDef } from "@/lib/record-actions";

export function DeskModeButton({
  action,
  label,
  active,
  mobilePill = false,
  showDraftDot = false,
  onSelect,
}: {
  action: RecordActionDef;
  label: string;
  active: boolean;
  mobilePill?: boolean;
  showDraftDot?: boolean;
  onSelect: () => void;
}) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        "flex shrink-0 items-center gap-2 text-sm font-medium transition-colors",
        mobilePill
          ? cn(
              "min-h-10 rounded-full border px-3.5 py-2",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-[0_2px_10px] shadow-primary/30"
                : "border-border bg-card text-foreground",
            )
          : cn(
              "min-w-[8.5rem] gap-2.5 rounded-md px-3 py-2.5 text-left lg:min-w-0 lg:w-full",
              active
                ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            ),
      )}
      onClick={onSelect}
    >
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center",
          mobilePill
            ? "size-5"
            : cn(
                "size-8 rounded-md",
                active
                  ? "bg-primary/15 text-primary"
                  : "bg-muted/60 text-muted-foreground",
              ),
        )}
      >
        <Icon className={cn(mobilePill ? "size-4" : "size-4")} aria-hidden />
        {showDraftDot && (
          <span
            className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-warning"
            aria-hidden
          />
        )}
      </span>
      {/* The dot is aria-hidden, so the sr-only text is the only announcement
          of unfinished work. Was an aria-description, which role="tab" drops. */}
      <span className="leading-tight">
        {label}
        {showDraftDot && <span className="sr-only"> — saved draft</span>}
      </span>
    </button>
  );
}

export function DeskExtraButton({
  action,
  label,
  onOpen,
}: {
  action: RecordActionDef;
  label: string;
  onOpen: () => void;
}) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      className="flex w-full min-w-[8.5rem] shrink-0 items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground lg:min-w-0"
      onClick={onOpen}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="leading-tight">{label}</span>
    </button>
  );
}

export function morePillLabel(action: RecordActionDef): string {
  if (action.id === "splitExpense") return "Split";
  return action.label;
}

export function MoreActionButton({
  action,
  onOpen,
}: {
  action: RecordActionDef;
  onOpen: () => void;
}) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted/60"
      onClick={onOpen}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="font-medium leading-tight">{action.label}</span>
    </button>
  );
}
