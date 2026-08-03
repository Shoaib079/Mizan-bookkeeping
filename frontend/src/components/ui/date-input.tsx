"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  addDays,
  displayFromDate,
  formatMonthYear,
  getCalendarDays,
  isFutureDay,
  isSameDay,
  lateNightDateHint,
  parseDisplayToDate,
  startOfDay,
  weekdayLabels,
} from "@/lib/dates";
import { shouldOpenCalendarOnClick } from "@/lib/date-input-open";
import { MOBILE_SHELL_MAX_WIDTH_PX } from "@/lib/mobile-shell";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { cn } from "@/lib/utils";

export type DateInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  placeholder?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Off for report filters where today's date is normal (avoids clutter/overlap). */
  showLateNightHint?: boolean;
  /** Block calendar days after today — default for all posting/entry dates. */
  disableFuture?: boolean;
};

const CALENDAR_WIDTH_PX = 280;
const CALENDAR_HEIGHT_EST_PX = 340;
const VIEWPORT_PAD_PX = 8;

function viewFromValue(
  value: string,
  today: Date | null,
  disableFuture: boolean,
): { year: number; month: number } | null {
  const parsed = parseDisplayToDate(value);
  if (parsed) {
    if (disableFuture && today && isFutureDay(parsed, today)) {
      return { year: today.getFullYear(), month: today.getMonth() };
    }
    return { year: parsed.getFullYear(), month: parsed.getMonth() };
  }
  if (today) {
    return { year: today.getFullYear(), month: today.getMonth() };
  }
  return null;
}

function computeMobileCalendarStyle(anchor: DOMRect): CSSProperties {
  const width = Math.min(
    CALENDAR_WIDTH_PX,
    window.innerWidth - VIEWPORT_PAD_PX * 2,
  );
  let left = anchor.left;
  left = Math.max(
    VIEWPORT_PAD_PX,
    Math.min(left, window.innerWidth - width - VIEWPORT_PAD_PX),
  );

  let top = anchor.bottom + 4;
  if (top + CALENDAR_HEIGHT_EST_PX > window.innerHeight - VIEWPORT_PAD_PX) {
    const above = anchor.top - CALENDAR_HEIGHT_EST_PX - 4;
    if (above >= VIEWPORT_PAD_PX) {
      top = above;
    } else {
      top = Math.max(
        VIEWPORT_PAD_PX,
        window.innerHeight - CALENDAR_HEIGHT_EST_PX - VIEWPORT_PAD_PX,
      );
    }
  }

  return { position: "fixed", left, top, width, zIndex: 60 };
}

type CalendarPanelProps = {
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
  panelRef?: React.RefObject<HTMLDivElement | null>;
  isMobile?: boolean;
};

function CalendarPanel({
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
}: CalendarPanelProps) {
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
            isMobile ? "h-7 w-7" : "h-8 w-8",
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
            isMobile ? "h-7 w-7" : "h-8 w-8",
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

export function DateInput({
  id,
  value,
  onChange,
  disabled,
  required,
  className,
  placeholder = "DD.MM.YYYY",
  onKeyDown,
  showLateNightHint = true,
  disableFuture = true,
}: DateInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobileShell();
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState<Date | null>(null);
  const [lateNightHint, setLateNightHint] = useState<string | null>(null);
  const [mobileCalendarStyle, setMobileCalendarStyle] = useState<
    CSSProperties | undefined
  >(undefined);

  const selected = parseDisplayToDate(value);
  const [viewYear, setViewYear] = useState(0);
  const [viewMonth, setViewMonth] = useState(0);

  useEffect(() => {
    setToday(startOfDay(new Date()));
  }, []);

  const showCalendar = useCallback(() => {
    if (!shouldOpenCalendarOnClick(disabled) || !today) return;
    const next = viewFromValue(value, today, disableFuture);
    if (next) {
      setViewYear(next.year);
      setViewMonth(next.month);
    }
    setOpen(true);
  }, [disableFuture, disabled, today, value]);

  useEffect(() => {
    if (open || !today) return;
    const next = viewFromValue(value, today, disableFuture);
    if (next) {
      setViewYear(next.year);
      setViewMonth(next.month);
    }
  }, [open, today, value, disableFuture]);

  useEffect(() => {
    if (!showLateNightHint) {
      setLateNightHint(null);
      return;
    }
    setLateNightHint(lateNightDateHint(value));
  }, [value, showLateNightHint]);

  const updateMobileCalendarPosition = useCallback(() => {
    if (!isMobile || !inputRef.current) return;
    setMobileCalendarStyle(
      computeMobileCalendarStyle(inputRef.current.getBoundingClientRect()),
    );
  }, [isMobile]);

  useLayoutEffect(() => {
    if (!open || !isMobile) {
      setMobileCalendarStyle(undefined);
      return;
    }
    updateMobileCalendarPosition();
  }, [open, isMobile, updateMobileCalendarPosition, viewYear, viewMonth]);

  useEffect(() => {
    if (!open || !isMobile) return;
    const onViewportChange = () => updateMobileCalendarPosition();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, isMobile, updateMobileCalendarPosition]);

  useEffect(() => {
    if (!open) return;
    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (calendarRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [open]);

  const isDateDisabled = useCallback(
    (date: Date) =>
      Boolean(today) && disableFuture && isFutureDay(date, today!),
    [disableFuture, today],
  );

  const canGoNextMonth =
    !disableFuture ||
    !today ||
    viewYear < today.getFullYear() ||
    (viewYear === today.getFullYear() && viewMonth < today.getMonth());

  const pickDate = useCallback(
    (date: Date) => {
      if (isDateDisabled(date)) return;
      onChange(displayFromDate(date));
      setOpen(false);
      if (isMobile) {
        inputRef.current?.blur();
      } else {
        inputRef.current?.focus();
      }
    },
    [isDateDisabled, isMobile, onChange],
  );

  const clampTypedValue = useCallback(() => {
    if (!disableFuture || !today) return;
    const parsed = parseDisplayToDate(value);
    if (parsed && isFutureDay(parsed, today)) {
      onChange(displayFromDate(today));
    }
  }, [disableFuture, onChange, today, value]);

  const toggleCalendar = useCallback(() => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    showCalendar();
  }, [disabled, open, showCalendar]);

  const adjustDay = useCallback(
    (delta: number) => {
      if (!today) return;
      const base = selected ?? today;
      const next = addDays(base, delta);
      if (isDateDisabled(next)) return;
      onChange(displayFromDate(next));
    },
    [isDateDisabled, onChange, selected, today],
  );

  const shiftMonth = (delta: number) => {
    if (delta > 0 && !canGoNextMonth) return;
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (open) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key === "Enter") {
        setOpen(false);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        adjustDay(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        adjustDay(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        adjustDay(-7);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        adjustDay(7);
        return;
      }
    }
    onKeyDown?.(event);
  };

  const cells = getCalendarDays(viewYear, viewMonth);

  const calendarPanel =
    open && today ? (
      <CalendarPanel
        panelRef={calendarRef}
        viewYear={viewYear}
        viewMonth={viewMonth}
        canGoNextMonth={canGoNextMonth}
        cells={cells}
        selected={selected}
        today={today}
        isDateDisabled={isDateDisabled}
        onShiftMonth={shiftMonth}
        onPickDate={pickDate}
        isMobile={isMobile}
        style={isMobile ? mobileCalendarStyle : undefined}
        className={
          isMobile
            ? undefined
            : "absolute left-0 top-full z-50 mt-1"
        }
      />
    ) : null;

  return (
    <div ref={rootRef} className={className}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={clampTypedValue}
          onClick={showCalendar}
          onKeyDown={handleInputKeyDown}
          className={cn(
            "h-9 w-full rounded-md border border-border bg-background py-2 pl-3 pr-9 text-base touch-manipulation md:text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            disabled && "cursor-not-allowed opacity-50",
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Open calendar"
          aria-expanded={open}
          onClick={toggleCalendar}
          className={cn(
            "absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground touch-manipulation",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <Calendar className="h-4 w-4" />
        </button>

        {!isMobile && calendarPanel}
      </div>

      {isMobile && typeof document !== "undefined"
        ? calendarPanel
          ? createPortal(calendarPanel, document.body)
          : null
        : null}

      {lateNightHint && (
        <p className="mt-1 text-xs text-warning">{lateNightHint}</p>
      )}
    </div>
  );
}

/** Exported for tests — mobile calendar width cap matches shell breakpoint. */
export const dateInputMobileMaxWidthPx = MOBILE_SHELL_MAX_WIDTH_PX;
