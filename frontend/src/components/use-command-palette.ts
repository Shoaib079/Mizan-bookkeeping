"use client";

/** Open/search/keyboard/select state for CommandPalette. */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PaletteRow } from "@/components/command-palette-types";
import { useQuickActions } from "@/components/quick-actions";
import { apiFetch } from "@/lib/api";
import { appRoutes, filterRoutesByEntitySettings } from "@/lib/app-routes";
import { currentMonthRange } from "@/lib/date-range";
import {
  canWriteDailyTransactions,
  filterAppRoutesForGrants,
} from "@/lib/entity-access";
import { useEntity } from "@/lib/entity-context";
import {
  PALETTE_SEARCH_DEBOUNCE_MS,
  PALETTE_SEARCH_MIN_CHARS,
  isStale,
  nextSearchGeneration,
  searchCustomers,
  searchExpenseItems,
  searchSuppliers,
  type PaletteCustomer,
  type PaletteExpenseItem,
  type PaletteSupplier,
} from "@/lib/palette-search";
import type { TimeSeriesRead } from "@/lib/report-types";
import {
  RECORD_ACTIONS,
  filterRecordActions,
} from "@/lib/record-actions";
import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
import { useEntityAccess } from "@/lib/use-entity-access";
import { reviewExpensesFilteredHref } from "@/lib/use-expenses-review-url";

export function useCommandPalette(deliveryEnabled: boolean) {
  const router = useRouter();
  const { entityId } = useEntity();
  const { grants } = useEntityAccess();
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

  const [supplierSpend, setSupplierSpend] = useState<Map<string, number>>(
    new Map(),
  );
  const [itemSpend, setItemSpend] = useState<Map<string, number>>(new Map());

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
    () =>
      filterAppRoutesForGrants(
        filterRoutesByEntitySettings(appRoutes, { deliveryEnabled }),
        grants,
      ),
    [deliveryEnabled, grants],
  );

  const actions = useMemo(
    () =>
      canWriteDailyTransactions(grants)
        ? filterRecordActions(
            RECORD_ACTIONS.filter((a) => !a.hidden),
            { deliveryEnabled, grants },
          )
        : [],
    [grants, deliveryEnabled],
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

  return {
    open,
    panelRef,
    inputRef,
    listRef,
    query,
    setQuery,
    activeIndex,
    setActiveIndex,
    rows,
    select,
    supplierSpend,
    itemSpend,
  };
}
