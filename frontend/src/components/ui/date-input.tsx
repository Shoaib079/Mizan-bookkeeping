"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

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
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState<Date | null>(null);
  const [lateNightHint, setLateNightHint] = useState<string | null>(null);

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

  useEffect(() => {
    if (!open) return;
    function onDocumentMouseDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
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
      inputRef.current?.focus();
    },
    [isDateDisabled, onChange],
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

  return (
    <div ref={rootRef} className={cn("relative", className)}>
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
          "h-9 w-full rounded-md border border-border bg-background py-2 pl-3 pr-9 text-sm",
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
          "absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <Calendar className="h-4 w-4" />
      </button>

      {open && today && (
        <div
          role="dialog"
          aria-label="Choose date"
          className="absolute left-0 top-full z-50 mt-1 w-[17.5rem] rounded-lg border border-border bg-card p-3 shadow-md"
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium capitalize">
              {formatMonthYear(viewYear, viewMonth)}
            </span>
            <button
              type="button"
              aria-label="Next month"
              disabled={!canGoNextMonth}
              onClick={() => shiftMonth(1)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
                !canGoNextMonth && "cursor-not-allowed opacity-40 hover:bg-transparent",
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {weekdayLabels().map((label) => (
              <div
                key={label}
                className="py-1 text-center text-[0.65rem] font-medium text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
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
                  onClick={() => pickDate(cell)}
                  className={cn(
                    "h-8 rounded-md text-sm tabular-nums",
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
            className="mt-2 w-full rounded-md py-1.5 text-xs text-primary hover:bg-sidebar-accent"
            onClick={() => pickDate(today)}
          >
            Today
          </button>
        </div>
      )}

      {lateNightHint && (
        <p className="mt-1 text-xs text-warning">{lateNightHint}</p>
      )}
    </div>
  );
}
