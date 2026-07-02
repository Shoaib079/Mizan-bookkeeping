"use client";

/** Type-to-filter picker — DESIGN_SYSTEM.md §10. */

import { ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
};

export type ComboboxProps = {
  id?: string;
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  className?: string;
  required?: boolean;
};

export function Combobox({
  id,
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  disabled,
  emptyMessage = "No matches",
  className,
  required,
}: ComboboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(q),
    );
  }, [options, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const select = useCallback(
    (nextValue: string) => {
      onValueChange(nextValue);
      close();
      inputRef.current?.focus();
    },
    [close, onValueChange],
  );

  const openList = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setActiveIndex(0);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [disabled]);

  useDismissOnOutsideClick(rootRef, open, close, { escape: false });

  useEffect(() => {
    setActiveIndex(0);
    listRef.current?.scrollTo({ top: 0 });
  }, [query]);

  useEffect(() => {
    if (open) {
      listRef.current?.scrollTo({ top: 0 });
    }
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const inputValue = open ? query : (selected?.label ?? "");

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        openList();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        Math.min(index + 1, Math.max(filtered.length - 1, 0)),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && filtered[activeIndex]) {
      event.preventDefault();
      select(filtered[activeIndex].value);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        disabled={disabled}
        required={required}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && filtered[activeIndex]
            ? `${listboxId}-opt-${activeIndex}`
            : undefined
        }
        placeholder={placeholder}
        value={inputValue}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={openList}
        onKeyDown={handleKeyDown}
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
        aria-label="Open options"
        aria-expanded={open}
        onClick={() => (open ? close() : openList())}
        className={cn(
          "absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div
          id={listboxId}
          ref={listRef}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-card py-1 shadow-md"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            filtered.map((option, index) => (
              <button
                key={`${option.value}-${option.label}`}
                id={`${listboxId}-opt-${index}`}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={cn(
                  "flex w-full px-3 py-2 text-left text-sm",
                  index === activeIndex && "bg-sidebar-accent text-primary",
                  option.value === value && index !== activeIndex && "font-medium",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(option.value)}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
