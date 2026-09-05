"use client";

/** The shape every hub takes (DESIGN_ARCHETYPES §4).
 *
 * Banking, Delivery, Review, Record, Reports, More and Settings all present a
 * grid of "go here" tiles; each used to draw its own grid and tile. One tile,
 * one grid, everywhere. Under v2: muted left accent + tinted Lucide square. */

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/page/page-header";
import {
  IconSquare,
  type IconStroke,
  type IconTint,
} from "@/components/ui/icon-square";
import {
  ACCENT_BAR,
  MeaningCardAccentBar,
  type AccentBarTone,
} from "@/components/ui/meaning-card";
import type { OverflowMenuItem } from "@/components/ui/overflow-menu";
import { cn } from "@/lib/utils";

export type HubTile = {
  key: string;
  href: string;
  icon: LucideIcon;
  title: string;
  /** One line of context — a balance, a count, what lives here. */
  subtitle?: string;
  /** Right-aligned figure (balances) — tabular. */
  amount?: string;
  /** Amber count badge (review queues). */
  badge?: number;
  disabled?: boolean;
  /** Muted left bar (default blue). */
  accent?: AccentBarTone;
  iconTint?: IconTint;
  iconStroke?: IconStroke;
};

export function HubTileCard({ tile }: { tile: HubTile }) {
  const { icon: Icon } = tile;
  const tint = tile.iconTint ?? "sky";
  const stroke = tile.iconStroke ?? "blue";
  const accent = tile.accent ?? "blue";
  const body = (
    <>
      <MeaningCardAccentBar />
      <div className="flex items-start justify-between gap-3">
        <IconSquare icon={Icon} tint={tint} stroke={stroke} size="lg" />
        {tile.badge !== undefined && tile.badge > 0 && (
          <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
            {tile.badge}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm font-medium">{tile.title}</p>
      {tile.subtitle && (
        <p className="mt-0.5 text-xs text-muted-foreground">{tile.subtitle}</p>
      )}
      {tile.amount && (
        <p className="mt-2 text-lg font-semibold tabular-nums">{tile.amount}</p>
      )}
    </>
  );

  const className = cn(
    "relative block rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-colors",
    tile.disabled
      ? "pointer-events-none opacity-60"
      : "hover:border-primary/40 hover:bg-muted/30",
  );

  const shellStyle = { ["--accent-bar" as string]: ACCENT_BAR[accent] };

  if (tile.disabled) {
    return (
      <div data-meaning-card data-testid="hub-tile-card" className={className} style={shellStyle}>
        {body}
      </div>
    );
  }
  return (
    <Link
      href={tile.href}
      data-meaning-card
      data-testid="hub-tile-card"
      className={className}
      style={shellStyle}
    >
      {body}
    </Link>
  );
}

type Props = {
  title: string;
  meta?: React.ReactNode;
  primaryAction?: React.ReactNode;
  actions?: React.ReactNode;
  overflowActions?: OverflowMenuItem[];
  /** Optional strip above the grid — KPI cards, a period picker. */
  summary?: React.ReactNode;
  tiles?: HubTile[];
  /** Grouped tiles when a hub has sections (Record, Reports). */
  groups?: { key: string; title: string; tiles: HubTile[] }[];
  /** Anything below the grid. */
  children?: React.ReactNode;
  error?: string | null;
  className?: string;
};

function TileGrid({ tiles }: { tiles: HubTile[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((tile) => (
        <HubTileCard key={tile.key} tile={tile} />
      ))}
    </div>
  );
}

export function HubPage({
  title,
  meta,
  primaryAction,
  actions,
  overflowActions,
  summary,
  tiles,
  groups,
  children,
  error,
  className,
}: Props) {
  return (
    <div className={className}>
      <PageHeader
        title={title}
        meta={meta}
        primaryAction={primaryAction}
        actions={actions}
        overflowActions={overflowActions}
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {summary && <div className="mb-5">{summary}</div>}

      {tiles && tiles.length > 0 && <TileGrid tiles={tiles} />}

      {groups?.map((group) => (
        <section key={group.key} className="mb-6 last:mb-0">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {group.title}
          </h2>
          <TileGrid tiles={group.tiles} />
        </section>
      ))}

      {children}
    </div>
  );
}
