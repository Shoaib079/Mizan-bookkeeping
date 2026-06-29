"use client";

/** Global Cmd/Ctrl-K navigation search (DESIGN_SYSTEM §10). */

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQuickActions } from "@/components/quick-actions";
import { Input } from "@/components/ui/input";
import { appRoutes, filterRoutesByEntitySettings } from "@/lib/app-routes";
import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
import { cn } from "@/lib/utils";

type Props = {
  deliveryEnabled: boolean;
};

export function CommandPalette({ deliveryEnabled }: Props) {
  const router = useRouter();
  const { openRecordAction } = useQuickActions();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const routes = useMemo(
    () => filterRoutesByEntitySettings(appRoutes, { deliveryEnabled }),
    [deliveryEnabled],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter(
      (route) =>
        route.label.toLowerCase().includes(q) ||
        route.href.toLowerCase().includes(q) ||
        route.keywords?.toLowerCase().includes(q) ||
        route.group.toLowerCase().includes(q),
    );
  }, [query, routes]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  useDismissOnOutsideClick(panelRef, open, close, { escape: false });

  const select = useCallback(
    (index: number) => {
      const route = filtered[index];
      if (!route) return;
      close();
      if (route.quickAction) {
        openRecordAction(route.quickAction);
        return;
      }
      router.push(route.href);
    },
    [close, filtered, openRecordAction, router],
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
        setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
      if (event.key === "Enter" && filtered[activeIndex]) {
        event.preventDefault();
        select(activeIndex);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close, filtered, activeIndex, select]);

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
  }, [query]);

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
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            className="border-0 shadow-none focus-visible:ring-0"
            placeholder="Search pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search pages"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1" role="listbox">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No matches
            </p>
          ) : (
            filtered.map((route, index) => (
              <button
                key={`${route.href}-${route.label}`}
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
                <route.icon className="size-4 shrink-0" />
                <span className="flex-1">{route.label}</span>
                <span className="text-xs text-muted-foreground">{route.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
