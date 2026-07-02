"use client";

import type { DeliveryPlatform } from "@/lib/pos-delivery-types";
import { cn } from "@/lib/utils";

type Props = {
  platforms: DeliveryPlatform[];
  selectedId: string | null;
  onSelect: (platformId: string | null) => void;
  showAll?: boolean;
};

/** Platform toggle row — null = all platforms combined. */
export function DeliveryPlatformFilter({
  platforms,
  selectedId,
  onSelect,
  showAll = true,
}: Props) {
  if (platforms.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-1"
      role="tablist"
      aria-label="Delivery platform"
    >
      {showAll && (
        <button
          type="button"
          role="tab"
          aria-selected={selectedId === null}
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm transition-colors",
            selectedId === null
              ? "border-primary bg-primary/10 font-medium text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onSelect(null)}
        >
          All platforms
        </button>
      )}
      {platforms.map((platform) => {
        const active = selectedId === platform.id;
        return (
          <button
            key={platform.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onSelect(platform.id)}
          >
            {platform.name}
          </button>
        );
      })}
    </div>
  );
}
