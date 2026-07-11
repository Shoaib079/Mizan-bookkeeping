"use client";

/** Sidebar restaurant switcher (audit A5) — the badge is now a real control. */

import { Check, ChevronsUpDown } from "lucide-react";
import { useRef, useState } from "react";

import { useEntity } from "@/lib/entity-context";
import { entityAccentColor, entityInitial } from "@/lib/entity-visual";
import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
import { cn } from "@/lib/utils";

export function SidebarEntitySwitcher() {
  const { entityId, entities, entitiesLoading, setEntityId } = useEntity();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useDismissOnOutsideClick(containerRef, open, () => setOpen(false));

  const activeEntity = entities.find((entity) => entity.id === entityId);

  if (!activeEntity) {
    return (
      <p className="px-1 text-xs text-muted-foreground">
        {entitiesLoading ? "Loading…" : "No restaurant selected"}
      </p>
    );
  }

  const color = entityAccentColor(activeEntity.id);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-left text-xs font-medium transition-colors hover:border-primary/40 hover:bg-muted/40"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: color }}
          aria-hidden
        >
          {entityInitial(activeEntity.name)}
        </span>
        <span className="min-w-0 flex-1 truncate">{activeEntity.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && entities.length > 0 && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg"
        >
          {entities.map((entity) => {
            const selected = entity.id === entityId;
            return (
              <button
                key={entity.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/60",
                  selected && "font-medium text-primary",
                )}
                onClick={() => {
                  setOpen(false);
                  if (!selected) {
                    setEntityId(entity.id, { redirectToDashboard: true });
                  }
                }}
              >
                <span
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: entityAccentColor(entity.id) }}
                  aria-hidden
                >
                  {entityInitial(entity.name)}
                </span>
                <span className="min-w-0 flex-1 truncate">{entity.name}</span>
                {selected && <Check className="size-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
