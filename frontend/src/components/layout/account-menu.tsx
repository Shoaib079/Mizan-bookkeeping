"use client";

/** Top-right account menu — avatar, restaurant switch, settings, sign out (Slice 12.0b). */

import { useClerk } from "@clerk/nextjs";
import {
  Building2,
  ChevronDown,
  LogOut,
  Scale,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { EntityBadge } from "@/components/layout/entity-badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  accountMenuAdminLinks,
  devModeIdentityLabel,
  switchConfirmMessage,
  unsavedWorkWarningMessage,
} from "@/lib/account-menu-helpers";
import { useApiAuth } from "@/lib/api-auth";
import { useEntity } from "@/lib/entity-context";
import { entityAccentColor, userInitials } from "@/lib/entity-visual";
import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
import { useToast } from "@/lib/toast";
import { useUnsavedWork } from "@/lib/unsaved-work";
import { useEntityAccess } from "@/lib/use-entity-access";
import { cn } from "@/lib/utils";

const LINK_ICONS: Record<string, typeof Settings> = {
  "/settings/entity": Building2,
  "/settings/opening-balances": Scale,
  "/settings/members": Users,
};

type PendingAction =
  | { type: "switch"; entityId: string; name: string }
  | { type: "sign-out" };

export function AccountMenu() {
  const { clerkEnabled } = useApiAuth();
  if (clerkEnabled) {
    return <AccountMenuWithClerk />;
  }
  return <AccountMenuDev />;
}

function AccountMenuWithClerk() {
  const router = useRouter();
  const { signOut } = useClerk();

  const handleSignOut = useCallback(async () => {
    await signOut({ redirectUrl: "/sign-in" });
    router.push("/sign-in");
  }, [router, signOut]);

  return <AccountMenuPanel devMode={false} onSignOut={handleSignOut} />;
}

function AccountMenuDev() {
  return <AccountMenuPanel devMode onSignOut={undefined} />;
}

function AccountMenuPanel({
  devMode,
  onSignOut,
}: {
  devMode: boolean;
  onSignOut: (() => void | Promise<void>) | undefined;
}) {
  const { toast } = useToast();
  const { hasUnsavedWork } = useUnsavedWork();
  const { role } = useEntityAccess();
  const {
    entityId,
    setEntityId,
    actorId,
    setActorId,
    entities,
    entitiesLoading,
    userProfile,
  } = useEntity();

  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [unsavedConfirm, setUnsavedConfirm] = useState<PendingAction | null>(
    null,
  );

  const closeMenu = useCallback(() => {
    setOpen(false);
    setSwitchTarget(null);
  }, []);

  useDismissOnOutsideClick(menuRef, open, closeMenu);

  const activeEntity = useMemo(
    () => entities.find((entity) => entity.id === entityId),
    [entities, entityId],
  );

  const otherEntities = useMemo(
    () => entities.filter((entity) => entity.id !== entityId),
    [entities, entityId],
  );

  const adminLinks = useMemo(() => accountMenuAdminLinks(role), [role]);

  const displayName = devMode
    ? devModeIdentityLabel()
    : userProfile?.display_name?.trim() || "Signed in";
  const email = devMode ? "" : (userProfile?.email ?? "");
  const initials = devMode ? "DV" : userInitials(displayName, email);
  const avatarColor = entityAccentColor(
    devMode ? "dev-user" : (userProfile?.id ?? "user"),
  );

  const executeSwitch = useCallback(
    (targetId: string, targetName: string) => {
      setEntityId(targetId);
      closeMenu();
      toast(`Now working in ${targetName}`);
    },
    [closeMenu, setEntityId, toast],
  );

  const executeSignOut = useCallback(async () => {
    if (!onSignOut) return;
    closeMenu();
    await onSignOut();
  }, [closeMenu, onSignOut]);

  const runPending = useCallback(
    (action: PendingAction) => {
      if (action.type === "switch") {
        executeSwitch(action.entityId, action.name);
        return;
      }
      void executeSignOut();
    },
    [executeSignOut, executeSwitch],
  );

  const requestAction = useCallback(
    (action: PendingAction) => {
      if (hasUnsavedWork) {
        setUnsavedConfirm(action);
        return;
      }
      runPending(action);
    },
    [hasUnsavedWork, runPending],
  );

  function onPickRestaurant(targetId: string, targetName: string) {
    if (targetId === entityId) return;
    setSwitchTarget({ id: targetId, name: targetName });
  }

  function confirmSwitch() {
    if (!switchTarget) return;
    requestAction({
      type: "switch",
      entityId: switchTarget.id,
      name: switchTarget.name,
    });
    setSwitchTarget(null);
  }

  function onSignOutClick() {
    requestAction({ type: "sign-out" });
  }

  return (
    <div ref={menuRef} className="relative flex items-center gap-2">
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
          "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
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

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-card py-2 shadow-lg"
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
                  <p className="truncate text-xs text-muted-foreground">
                    {email}
                  </p>
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

          {otherEntities.length > 0 && (
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
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60"
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

          {devMode && entities.length === 0 && (
            <div className="space-y-3 border-b border-border px-4 py-3">
              <div>
                <Label htmlFor="account-menu-entity-id">Restaurant ID</Label>
                <Input
                  id="account-menu-entity-id"
                  className="mt-1 font-mono text-xs"
                  placeholder={entitiesLoading ? "Loading…" : "uuid"}
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
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
                onChange={(e) => setActorId(e.target.value)}
              />
            </div>
          )}

          {adminLinks.length > 0 && (
            <div className="border-b border-border px-2 py-2">
              {adminLinks.map((link) => {
                const Icon = LINK_ICONS[link.href] ?? Settings;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    role="menuitem"
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/60"
                    onClick={closeMenu}
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          )}

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
      )}

      {switchTarget && (
        <ConfirmOverlay
          title="Switch restaurant?"
          message={
            activeEntity
              ? switchConfirmMessage(activeEntity.name, switchTarget.name)
              : `Switch to ${switchTarget.name}?`
          }
          confirmLabel="Switch"
          onCancel={() => setSwitchTarget(null)}
          onConfirm={confirmSwitch}
        />
      )}

      {unsavedConfirm && (
        <ConfirmOverlay
          title="Unsaved changes"
          message={unsavedWorkWarningMessage()}
          confirmLabel="Leave anyway"
          onCancel={() => setUnsavedConfirm(null)}
          onConfirm={() => {
            const action = unsavedConfirm;
            setUnsavedConfirm(null);
            runPending(action);
          }}
        />
      )}
    </div>
  );
}

function ConfirmOverlay({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
      role="alertdialog"
      aria-modal
      aria-labelledby="account-confirm-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg">
        <h3 id="account-confirm-title" className="text-sm font-semibold">
          {title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
