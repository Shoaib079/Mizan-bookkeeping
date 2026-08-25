"use client";

import { ChevronDown } from "lucide-react";

import { EntityBadge } from "@/components/layout/entity-badge";
import { entityAccentColor } from "@/lib/entity-visual";
import { cn } from "@/lib/utils";

type ActiveEntity = { id: string; name: string };

type Props = {
  activeEntity: ActiveEntity | undefined;
  open: boolean;
  onToggle: () => void;
  initials: string;
  avatarColor: string;
};

export function AccountMenuTrigger({
  activeEntity,
  open,
  onToggle,
  initials,
  avatarColor,
}: Props) {
  return (
    <>
      {activeEntity && (
        <EntityBadge
          entityId={activeEntity.id}
          name={activeEntity.name}
          className="hidden sm:inline-flex"
        />
      )}

      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-2 text-sm",
          "hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
      >
        <span className="relative inline-flex">
          <span
            className="inline-flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: avatarColor }}
            aria-hidden
          >
            {initials}
          </span>
          {activeEntity && (
            <span
              className="absolute -bottom-0.5 -right-0.5 inline-flex size-4 items-center justify-center rounded-full border-2 border-background text-[8px] font-bold text-white"
              style={{ backgroundColor: entityAccentColor(activeEntity.id) }}
              aria-hidden
            >
              {activeEntity.name.trim().charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
    </>
  );
}
