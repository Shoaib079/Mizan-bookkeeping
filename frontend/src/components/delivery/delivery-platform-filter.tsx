"use client";

import { FilterChips } from "@/components/page/filter-chips";
import type { DeliveryPlatform } from "@/lib/pos-delivery-types";

type Props = {
  platforms: DeliveryPlatform[];
  selectedId: string | null;
  onSelect: (platformId: string | null) => void;
  showAll?: boolean;
};

const ALL = "__all__";

/** Platform toggle row — null = all platforms combined. */
export function DeliveryPlatformFilter({
  platforms,
  selectedId,
  onSelect,
  showAll = true,
}: Props) {
  if (platforms.length === 0) return null;

  const chips = [
    ...(showAll ? [{ id: ALL, label: "All platforms" }] : []),
    ...platforms.map((platform) => ({
      id: platform.id,
      label: platform.name,
    })),
  ];

  return (
    <FilterChips
      chips={chips}
      value={selectedId ?? ALL}
      onChange={(id) => onSelect(id === ALL ? null : id)}
      ariaLabel="Delivery platform"
    />
  );
}
