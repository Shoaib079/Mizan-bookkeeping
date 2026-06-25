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
  isSameDay,
  parseDisplayToDate,
  weekdayLabels,
} from "@/lib/dates";
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
};

export function DateInput({
  id,
  value,
  onChange,
  disabled,
  required,
  className,
  placeholder = "DD.MM.YYYY",
  onKeyDown,
}: DateInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const selected = parseDisplayToDate(value);
  const today = new Date();
  const [viewYear, setViewYear] = useState(
    () => selected?.getFullYear() ?? today.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    () => selected?.getMonth() ?? today.getMonth(),
  );

  useEffect(() => {
    const parsed = parseDisplayToDate(value);
    if (parsed) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
    }
  }, [value]);

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

  const pickDate = useCallback(
    (date: Date) => {
      onChange(displayFromDate(date));
      setOpen(false);
      inputRef.current?.focus();
    },
    [onChange],
  );

  const adjustDay = useCallback(
    (delta: number) => {
      const base = selected ?? new Date();
      onChange(displayFromDate(addDays(base, delta)));
    },
    [onChange, selected],
  );

  const shiftMonth = (delta: number) => {
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
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <Calendar className="h-4 w-4" />
      </button>

      {open && (
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
              onClick={() => shiftMonth(1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
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
            {cells.map((cell, index) =>
              cell ? (
                <button
                  key={cell.toISOString()}
                  type="button"
                  onClick={() => pickDate(cell)}
                  className={cn(
                    "h-8 rounded-md text-sm tabular-nums",
                    "hover:bg-sidebar-accent hover:text-primary",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    selected && isSameDay(cell, selected)
                      ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                      : isSameDay(cell, today)
                        ? "font-semibold text-primary"
                        : "text-foreground",
                  )}
                >
                  {cell.getDate()}
                </button>
              ) : (
                <span key={`pad-${index}`} aria-hidden />
              ),
            )}
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
    </div>
  );
}
