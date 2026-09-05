"use client";

import { Calendar } from "lucide-react";
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

import { DateInputCalendar } from "@/components/ui/date-input-calendar";
import {
  computeMobileCalendarStyle,
  viewFromValue,
} from "@/components/ui/date-input-layout";
import type { DateInputProps } from "@/components/ui/date-input-types";
import {
  addDays,
  displayFromDate,
  getCalendarDays,
  isFutureDay,
  lateNightDateHint,
  parseDisplayToDate,
  startOfDay,
} from "@/lib/dates";
import { shouldOpenCalendarOnClick } from "@/lib/date-input-open";
import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { cn } from "@/lib/utils";

export type { DateInputProps } from "@/components/ui/date-input-types";

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

  const closeCalendar = useCallback(() => setOpen(false), []);

  useDismissOnOutsideClick(rootRef, open, closeCalendar, {
    escape: false,
    portalRef: calendarRef,
  });

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
      <DateInputCalendar
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
          isMobile ? undefined : "absolute left-0 top-full z-50 mt-1"
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
          inputMode={isMobile ? "none" : "numeric"}
          readOnly={isMobile}
          autoComplete="off"
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            if (isMobile) return;
            onChange(event.target.value);
          }}
          onBlur={isMobile ? undefined : clampTypedValue}
          onClick={showCalendar}
          onKeyDown={isMobile ? undefined : handleInputKeyDown}
          className={cn(
            "h-9 w-full rounded-md border border-border bg-background py-2 pl-3 pr-9 text-base touch-manipulation md:text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isMobile && "cursor-pointer caret-transparent",
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
            // 28px is small for a thumb, but this sits inside the field, so
            // 44px would overflow it. Taken to the input's own height on
            // mobile — as large as it can be without breaking the box.
            "absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground touch-manipulation",
            isMobile ? "h-8 w-8" : "h-7 w-7",
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
