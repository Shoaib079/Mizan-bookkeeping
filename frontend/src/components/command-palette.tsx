"use client";

/** Global ⌘K data-first search — suppliers, customers, items, pages, actions (UX-B, audit A6). */

import { Search, UserCircle, Users, Tags } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQuickActions } from "@/components/quick-actions";
import { Input } from "@/components/ui/input";
import { appRoutes, filterRoutesByEntitySettings } from "@/lib/app-routes";
import { useEntity } from "@/lib/entity-context";
import {
  RECORD_ACTIONS,
  filterRecordActions,
  type RecordActionDef,
} from "@/lib/record-actions";
import {
  PALETTE_SEARCH_DEBOUNCE_MS,
  PALETTE_SEARCH_MIN_CHARS,
  nextSearchGeneration,
  isStale,
  searchSuppliers,
  searchCustomers,
  searchExpenseItems,
  type PaletteSupplier,
  type PaletteCustomer,
  type PaletteExpenseItem,
} from "@/lib/palette-search";
import { currentMonthRange } from "@/lib/date-range";
import { formatTry } from "@/lib/money";
import type { TimeSeriesRead } from "@/lib/report-types";
import { reviewExpensesFilteredHref } from "@/lib/use-expenses-review-url";
import { apiFetch } from "@/lib/api";
import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
import { useEntityAccess } from "@/lib/use-entity-access";
import { canWriteOperations } from "@/lib/entity-access";
import { cn } from "@/lib/utils";

type Props = {
  deliveryEnabled: boolean;
};

type PaletteRow =
  | { kind: "supplier"; supplier: PaletteSupplier }
  | { kind: "customer"; customer: PaletteCustomer }
  | { kind: "item"; item: PaletteExpenseItem }
  | { kind: "page"; label: string; href: string; icon: React.ComponentType<{ className?: string }>; group: string }
  | { kind: "action"; action: RecordActionDef };

export function CommandPalette({ deliveryEnabled }: Props) {
  const router = useRouter();
  const { entityId } = useEntity();
  const { role } = useEntityAccess();
  const { openRecordAction } = useQuickActions();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [suppliers, setSuppliers] = useState<PaletteSupplier[]>([]);
  const [customers, setCustomers] = useState<PaletteCustomer[]>([]);
  const [items, setItems] = useState<PaletteExpenseItem[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevEntityRef = useRef(entityId);

  // SRCH-B: spend lookup maps (fetched once per palette open)
  const [supplierSpend, setSupplierSpend] = useState<Map<string, number>>(new Map());
  const [itemSpend, setItemSpend] = useState<Map<string, number>>(new Map());

  // Stale guard: reset search results on entity switch
  useEffect(() => {
    if (prevEntityRef.current !== entityId) {
      prevEntityRef.current = entityId;
      setSuppliers([]);
      setCustomers([]);
      setItems([]);
      setSupplierSpend(new Map());
      setItemSpend(new Map());
      nextSearchGeneration();
    }
  }, [entityId]);

  // SRCH-B: fetch spend totals when palette opens
  useEffect(() => {
    if (!open || !entityId) return;
    const range = currentMonthRange();
    void apiFetch<TimeSeriesRead>(
      `/entities/${entityId}/reports/time-series?from=${range.from}&to=${range.to}`,
    )
      .then((ts) => {
        setSupplierSpend(
          new Map(ts.spend_by_supplier.map((s) => [s.supplier_id, s.total_kurus])),
        );
        setItemSpend(
          new Map(ts.expenses_by_item.map((i) => [i.expense_item_id, i.total_kurus])),
        );
      })
      .catch(() => {
        setSupplierSpend(new Map());
        setItemSpend(new Map());
      });
  }, [open, entityId]);

  const routes = useMemo(
    () => filterRoutesByEntitySettings(appRoutes, { deliveryEnabled }),
    [deliveryEnabled],
  );

  const actions = useMemo(
    () =>
      canWriteOperations(role)
        ? filterRecordActions(
            RECORD_ACTIONS.filter((a) => !a.hidden),
            { deliveryEnabled },
          )
        : [],
    [role, deliveryEnabled],
  );

  // Debounced API search
  useEffect(() => {
    const q = query.trim();
    if (q.length < PALETTE_SEARCH_MIN_CHARS || !entityId) {
      setSuppliers([]);
      setCustomers([]);
      setItems([]);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const gen = nextSearchGeneration();
      void searchSuppliers(entityId, q, gen).then((res) => {
        if (!isStale(gen)) setSuppliers(res);
      });
      void searchCustomers(entityId, q, gen)
        .then((res) => {
          if (!isStale(gen)) setCustomers(res);
        })
        .catch(() => setCustomers([]));
      void searchExpenseItems(entityId, q, gen).then((res) => {
        if (!isStale(gen)) setItems(res);
      });
    }, PALETTE_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [query, entityId]);

  const rows = useMemo((): PaletteRow[] => {
    const q = query.trim().toLowerCase();
    const result: PaletteRow[] = [];

    // Data results first (only when typing)
    for (const s of suppliers) {
      result.push({ kind: "supplier", supplier: s });
    }
    for (const c of customers) {
      result.push({ kind: "customer", customer: c });
    }
    for (const i of items) {
      result.push({ kind: "item", item: i });
    }

    // Pages (always, filtered by query)
    const filteredRoutes = q
      ? routes.filter(
          (route) =>
            route.label.toLowerCase().includes(q) ||
            route.href.toLowerCase().includes(q) ||
            route.keywords?.toLowerCase().includes(q) ||
            route.group.toLowerCase().includes(q),
        )
      : routes;

    for (const route of filteredRoutes) {
      result.push({
        kind: "page",
        label: route.label,
        href: route.href,
        icon: route.icon,
        group: route.group,
      });
    }

    // Actions (only when typing, role-gated)
    if (q) {
      const filteredActions = actions.filter(
        (a) =>
          a.label.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q),
      );
      for (const action of filteredActions) {
        result.push({ kind: "action", action });
      }
    }

    return result;
  }, [query, suppliers, customers, items, routes, actions]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setSuppliers([]);
    setCustomers([]);
    setItems([]);
    nextSearchGeneration();
  }, []);

  useDismissOnOutsideClick(panelRef, open, close, { escape: false });

  const select = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;
      close();
      switch (row.kind) {
        case "supplier":
          router.push(`/suppliers/${row.supplier.id}`);
          break;
        case "customer":
          router.push(`/customers/${row.customer.id}`);
          break;
        case "item":
          router.push(
            reviewExpensesFilteredHref(row.item.id, row.item.canonical_name),
          );
          break;
        case "page":
          router.push(row.href);
          break;
        case "action":
          openRecordAction(row.action.id);
          break;
      }
    },
    [close, rows, router, openRecordAction],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
      if (event.key === "Enter" && rows[activeIndex]) {
        event.preventDefault();
        select(activeIndex);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close, rows, activeIndex, select]);

  useEffect(() => {
    function onOpenPalette() {
      setOpen(true);
    }
    window.addEventListener("mizan:command-palette", onOpenPalette);
    return () =>
      window.removeEventListener("mizan:command-palette", onOpenPalette);
  }, []);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
    listRef.current?.scrollTo({ top: 0 });
  }, [query, suppliers, customers, items]);

  useEffect(() => {
    if (open) {
      listRef.current?.scrollTo({ top: 0 });
    }
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 p-4 pt-[15vh]">
      <div
        ref={panelRef}
        className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-xl"
        role="dialog"
        aria-modal
        aria-label="Search"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            className="border-0 shadow-none focus-visible:ring-0"
            placeholder="Search suppliers, customers, items, pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search suppliers, customers, items, pages"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1" role="listbox">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No matches
            </p>
          ) : (
            rows.map((row, index) => (
              <button
                key={rowKey(row, index)}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2 text-left text-sm",
                  index === activeIndex && "bg-sidebar-accent text-primary",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(index)}
              >
                <RowIcon row={row} />
                <span className="min-w-0 flex-1 truncate">{rowLabel(row)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {rowBadge(row, supplierSpend, itemSpend)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function rowKey(row: PaletteRow, index: number): string {
  switch (row.kind) {
    case "supplier":
      return `s-${row.supplier.id}`;
    case "customer":
      return `c-${row.customer.id}`;
    case "item":
      return `i-${row.item.id}`;
    case "page":
      return `p-${row.href}`;
    case "action":
      return `a-${row.action.id}`;
    default:
      return `r-${index}`;
  }
}

function RowIcon({ row }: { row: PaletteRow }) {
  switch (row.kind) {
    case "supplier":
      return <Users className="size-4 shrink-0 text-blue-500" />;
    case "customer":
      return <UserCircle className="size-4 shrink-0 text-violet-500" />;
    case "item":
      return <Tags className="size-4 shrink-0 text-emerald-500" />;
    case "page":
      return <row.icon className="size-4 shrink-0" />;
    case "action":
      return <row.action.icon className="size-4 shrink-0 text-primary" />;
  }
}

function rowLabel(row: PaletteRow): string {
  switch (row.kind) {
    case "supplier":
      return row.supplier.name;
    case "customer":
      return row.customer.name;
    case "item":
      return row.item.canonical_name;
    case "page":
      return row.label;
    case "action":
      return row.action.label;
  }
}

function rowBadge(
  row: PaletteRow,
  supplierSpend: Map<string, number>,
  itemSpend: Map<string, number>,
): string {
  switch (row.kind) {
    case "supplier": {
      const spend = supplierSpend.get(row.supplier.id);
      return spend ? formatTry(spend) : "Supplier";
    }
    case "customer":
      return "Customer";
    case "item": {
      const spend = itemSpend.get(row.item.id);
      return spend ? formatTry(spend) : "Item";
    }
    case "page":
      return row.group;
    case "action":
      return "Add";
  }
}
