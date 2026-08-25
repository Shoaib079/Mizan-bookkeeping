"use client";

import { LogOut, Plus, Settings, User } from "lucide-react";
import Link from "next/link";

import { EntityBadge } from "@/components/layout/entity-badge";
import { Input, Label } from "@/components/ui/input";
import { entityAccentColor } from "@/lib/entity-visual";

type EntityRow = { id: string; name: string };

type Props = {
  displayName: string;
  email: string;
  initials: string;
  avatarColor: string;
  devMode: boolean;
  activeEntity: EntityRow | undefined;
  canSwitch: boolean;
  otherEntities: EntityRow[];
  onPickRestaurant: (id: string, name: string) => void;
  entitiesLoaded: boolean;
  entitiesLength: number;
  entitiesError: boolean;
  entitiesLoading: boolean;
  entityId: string;
  onEntityIdChange: (value: string) => void;
  actorId: string;
  onActorIdChange: (value: string) => void;
  showSettings: boolean;
  canCreate: boolean;
  onCloseMenu: () => void;
  onAddRestaurant: () => void;
  onSignOut: (() => void | Promise<void>) | undefined;
  onSignOutClick: () => void;
};

export function AccountMenuDropdown({
  displayName,
  email,
  initials,
  avatarColor,
  devMode,
  activeEntity,
  canSwitch,
  otherEntities,
  onPickRestaurant,
  entitiesLoaded,
  entitiesLength,
  entitiesError,
  entitiesLoading,
  entityId,
  onEntityIdChange,
  actorId,
  onActorIdChange,
  showSettings,
  canCreate,
  onCloseMenu,
  onAddRestaurant,
  onSignOut,
  onSignOutClick,
}: Props) {
  return (
    <div
      role="menu"
      className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-card py-2 shadow-[var(--shadow-pop)]"
    >
      <div className="border-b border-border px-4 pb-3 pt-1">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: avatarColor }}
            aria-hidden
          >
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            {email && (
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            )}
            {devMode && (
              <p className="text-xs text-muted-foreground">
                Clerk auth is off — use Actor ID below for API calls.
              </p>
            )}
          </div>
        </div>
      </div>

      {activeEntity && (
        <div className="border-b border-border px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Active restaurant
          </p>
          <EntityBadge entityId={activeEntity.id} name={activeEntity.name} />
        </div>
      )}

      {canSwitch && otherEntities.length > 0 && (
        <div className="border-b border-border px-2 py-2">
          <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
            Switch restaurant
          </p>
          <ul>
            {otherEntities.map((entity) => (
              <li key={entity.id}>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-primary/10"
                  onClick={() => onPickRestaurant(entity.id, entity.name)}
                >
                  <span
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: entityAccentColor(entity.id) }}
                    aria-hidden
                  >
                    {entity.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{entity.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {devMode && entitiesLoaded && entitiesLength === 0 && !entitiesError && (
        <div className="space-y-3 border-b border-border px-4 py-3">
          <div>
            <Label htmlFor="account-menu-entity-id">Restaurant ID</Label>
            <Input
              id="account-menu-entity-id"
              className="mt-1 font-mono text-xs"
              placeholder={entitiesLoading ? "Loading…" : "uuid"}
              value={entityId}
              onChange={(e) => onEntityIdChange(e.target.value)}
            />
          </div>
        </div>
      )}

      {devMode && (
        <div className="border-b border-border px-4 py-3">
          <Label htmlFor="account-menu-actor-id">Actor ID (dev)</Label>
          <Input
            id="account-menu-actor-id"
            className="mt-1 font-mono text-xs"
            value={actorId}
            onChange={(e) => onActorIdChange(e.target.value)}
          />
        </div>
      )}

      <div className="border-b border-border px-2 py-2">
        <Link
          href="/settings/profile"
          role="menuitem"
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-primary/10"
          onClick={onCloseMenu}
        >
          <User className="size-4 text-muted-foreground" />
          Your profile
        </Link>
        {showSettings && (
          <>
            <Link
              href="/settings/restaurant"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-primary/10"
              onClick={onCloseMenu}
            >
              <Settings className="size-4 text-muted-foreground" />
              Restaurant settings
            </Link>
            {canCreate && (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-primary/10"
                onClick={onAddRestaurant}
              >
                <Plus className="size-4 text-muted-foreground" />
                Add restaurant
              </button>
            )}
          </>
        )}
      </div>

      {onSignOut && (
        <div className="px-2 pt-1">
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
            onClick={onSignOutClick}
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
