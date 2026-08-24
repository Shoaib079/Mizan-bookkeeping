"use client";

/** Month grid for DateInput — nav, weekdays, day cells, Today. */

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CSSProperties, RefObject } from "react";

import { formatMonthYear, isSameDay, weekdayLabels } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type DateInputCalendarProps = {
  viewYear: number;
  viewMonth: number;
  canGoNextMonth: boolean;
  cells: (Date | null)[];
  selected: Date | null;
  today: Date;
  isDateDisabled: (date: Date) => boolean;
  onShiftMonth: (delta: number) => void;
  onPickDate: (date: Date) => void;
  className?: string;
  style?: CSSProperties;
  panelRef?: RefObject<HTMLDivElement | null>;
  isMobile?: boolean;
};

export function DateInputCalendar({
  viewYear,
  viewMonth,
  canGoNextMonth,
  cells,
  selected,
  today,
  isDateDisabled,
  onShiftMonth,
  onPickDate,
  className,
  style,
  panelRef,
  isMobile = false,
}: DateInputCalendarProps) {
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Choose date"
      style={style}
      className={cn(
        "rounded-lg border border-border bg-card shadow-md",
        isMobile ? "p-3" : "w-[17.5rem] p-4",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => onShiftMonth(-1)}
          className={cn(
            "flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
            // Was h-7 (28px) on mobile and h-8 on desktop — smaller on the
            // one device driven by thumbs. 44px on a phone, unchanged above.
            isMobile ? "h-11 w-11" : "h-8 w-8",
          )}
        >
          <ChevronLeft className={isMobile ? "h-4 w-4" : "h-5 w-5"} />
        </button>
        <span
          className={cn(
            "font-medium capitalize",
            isMobile ? "text-sm" : "text-base",
          )}
        >
          {formatMonthYear(viewYear, viewMonth)}
        </span>
        <button
          type="button"
          aria-label="Next month"
          disabled={!canGoNextMonth}
          onClick={() => onShiftMonth(1)}
          className={cn(
            "flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
            // Was h-7 (28px) on mobile and h-8 on desktop — smaller on the
            // one device driven by thumbs. 44px on a phone, unchanged above.
            isMobile ? "h-11 w-11" : "h-8 w-8",
            !canGoNextMonth && "cursor-not-allowed opacity-40 hover:bg-transparent",
          )}
        >
          <ChevronRight className={isMobile ? "h-4 w-4" : "h-5 w-5"} />
        </button>
      </div>

      <div className={cn("mb-1 grid grid-cols-7", isMobile ? "gap-0.5" : "gap-1")}>
        {weekdayLabels().map((label) => (
          <div
            key={label}
            className={cn(
              "py-1 text-center font-medium text-muted-foreground",
              isMobile ? "text-[0.65rem]" : "text-xs",
            )}
          >
            {label}
          </div>
        ))}
      </div>

      <div className={cn("grid grid-cols-7", isMobile ? "gap-0.5" : "gap-1")}>
        {cells.map((cell, index) => {
          if (!cell) {
            return <span key={`pad-${index}`} aria-hidden />;
          }
          const future = isDateDisabled(cell);
          const isSelected = selected != null && isSameDay(cell, selected);
          const isToday = isSameDay(cell, today);
          return (
            <button
              key={cell.toISOString()}
              type="button"
              disabled={future}
              aria-disabled={future}
              onClick={() => onPickDate(cell)}
              className={cn(
                "rounded-md tabular-nums",
                isMobile ? "h-8 text-sm" : "h-9 text-base",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                future &&
                  "cursor-not-allowed text-muted-foreground/40 hover:bg-transparent",
                !future && "hover:bg-sidebar-accent hover:text-primary",
                !future &&
                  isSelected &&
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                !future &&
                  !isSelected &&
                  isToday &&
                  "font-semibold text-primary",
                !future && !isSelected && !isToday && "text-foreground",
              )}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={cn(
          "mt-2 w-full rounded-md text-primary hover:bg-sidebar-accent",
          isMobile ? "py-1.5 text-xs" : "py-2 text-sm",
        )}
        onClick={() => onPickDate(today)}
      >
        Today
      </button>
    </div>
  );
}
