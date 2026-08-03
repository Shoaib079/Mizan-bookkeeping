"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { EntityBadge } from "@/components/layout/entity-badge";
import { useEntity } from "@/lib/entity-context";
import { entityAccentColor, entityInitial } from "@/lib/entity-visual";
import { cn } from "@/lib/utils";

/** Restaurant switcher on More tab (C4.2). */
export function MobileEntitySwitcher() {
  const { entityId, setEntityId, entities, entitiesLoading } = useEntity();
  const [open, setOpen] = useState(false);
  const active = entities.find((e) => e.id === entityId);

  if (entitiesLoading && !active) {
    return (
      <div className="mb-5 h-[68px] animate-pulse rounded-xl bg-muted" />
    );
  }

  if (!active || !entityId) return null;

  return (
    <div className="relative mb-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-[68px] items-center gap-3 rounded-xl bg-card px-4 shadow-sm active:bg-muted/50"
        aria-expanded={open}
      >
        <EntityBadge entityId={entityId} name={active.name} />
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-[15px] font-semibold">{active.name}</p>
          <p className="text-xs text-muted-foreground">Switch restaurant</p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition",
            open && "rotate-180",
          )}
        />
      </button>

      {open && entities.length > 1 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-pop)]">
          {entities.map((entity) => (
            <button
              key={entity.id}
              type="button"
              onClick={() => {
                setEntityId(entity.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted/60",
                entity.id === entityId && "bg-primary/5",
              )}
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
                style={{ backgroundColor: entityAccentColor(entity.id) }}
              >
                {entityInitial(entity.name)}
              </span>
              <span className="truncate text-sm font-medium">{entity.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
