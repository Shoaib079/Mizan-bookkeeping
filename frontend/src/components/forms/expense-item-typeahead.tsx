"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import {
  EXPENSE_ITEM_SEARCH_DEBOUNCE_MS,
  expenseItemSearchUrl,
  shouldSearchExpenseItems,
  type ExpenseItemSearchResult,
} from "@/lib/expense-item-search";
import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
import { cn } from "@/lib/utils";

type Props = {
  entityId: string;
  id?: string;
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  onPickItem: (item: ExpenseItemSearchResult) => void;
  disabled?: boolean;
};

export function ExpenseItemTypeahead({
  entityId,
  id = "exp-item",
  label = "Item name",
  value,
  onValueChange,
  onPickItem,
  disabled,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ExpenseItemSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(0);
  }, []);

  useDismissOnOutsideClick(rootRef, open, close);

  useEffect(() => {
    if (!entityId || !shouldSearchExpenseItems(value)) {
      setResults([]);
      setOpen(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const res = await apiFetch<{ items: ExpenseItemSearchResult[] }>(
            expenseItemSearchUrl(entityId, value),
          );
          setResults(res.items);
          setOpen(res.items.length > 0);
          setActiveIndex(0);
        } catch {
          setResults([]);
          setOpen(false);
        } finally {
          setLoading(false);
        }
      })();
    }, EXPENSE_ITEM_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [entityId, value]);

  function handlePick(item: ExpenseItemSearchResult) {
    onPickItem(item);
    close();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      handlePick(results[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="peynir"
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-card py-1 shadow-md"
        >
          {loading && results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
          ) : (
            results.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "flex w-full px-3 py-2 text-left text-sm",
                  index === activeIndex && "bg-sidebar-accent text-primary",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handlePick(item)}
              >
                {item.canonical_name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
