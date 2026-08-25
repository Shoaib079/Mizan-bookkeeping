"use client";

/** Top-right account menu — avatar, restaurant switch, settings, sign out (Slice 12.0b). */

import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { AccountMenuConfirmOverlay } from "@/components/layout/account-menu-confirm-overlay";
import { AccountMenuDropdown } from "@/components/layout/account-menu-dropdown";
import { AccountMenuTrigger } from "@/components/layout/account-menu-trigger";
import { useAccountMenuPanel } from "@/components/layout/use-account-menu-panel";
import { CreateRestaurantDialog } from "@/components/settings/create-restaurant-dialog";
import { clearMizanStorage } from "@/lib/entity-context";
import { useApiAuth } from "@/lib/api-auth";

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
    clearMizanStorage();
    await signOut({ redirectUrl: "/sign-in" });
    router.push("/sign-in");
  }, [router, signOut]);

  return <AccountMenuPanel devMode={false} onSignOut={handleSignOut} />;
}

function AccountMenuDev() {
  return <AccountMenuPanel devMode onSignOut={undefined} />;
}

export function AccountMenuPanel({
  devMode,
  onSignOut,
}: {
  devMode: boolean;
  onSignOut: (() => void | Promise<void>) | undefined;
}) {
  const s = useAccountMenuPanel({ devMode, onSignOut });

  return (
    <div ref={s.menuRef} className="relative flex items-center gap-2">
      <AccountMenuTrigger
        activeEntity={s.activeEntity}
        open={s.open}
        onToggle={() => s.setOpen((value) => !value)}
        initials={s.initials}
        avatarColor={s.avatarColor}
      />

      {s.open && (
        <AccountMenuDropdown
          displayName={s.displayName}
          email={s.email}
          initials={s.initials}
          avatarColor={s.avatarColor}
          devMode={s.devMode}
          activeEntity={s.activeEntity}
          canSwitch={s.canSwitch}
          otherEntities={s.otherEntities}
          onPickRestaurant={s.onPickRestaurant}
          entitiesLoaded={s.entitiesLoaded}
          entitiesLength={s.entities.length}
          entitiesError={s.entitiesError}
          entitiesLoading={s.entitiesLoading}
          entityId={s.entityId}
          onEntityIdChange={s.setEntityId}
          actorId={s.actorId}
          onActorIdChange={s.setActorId}
          showSettings={s.showSettings}
          canCreate={s.canCreate}
          onCloseMenu={s.closeMenu}
          onAddRestaurant={() => {
            s.closeMenu();
            s.setCreateOpen(true);
          }}
          onSignOut={s.onSignOut}
          onSignOutClick={s.onSignOutClick}
        />
      )}

      <CreateRestaurantDialog
        open={s.createOpen}
        onClose={() => s.setCreateOpen(false)}
      />

      {s.switchTarget && (
        <AccountMenuConfirmOverlay
          title={s.switchConfirmTitle}
          message={s.switchConfirmBody}
          confirmLabel="Switch"
          onCancel={() => s.setSwitchTarget(null)}
          onConfirm={s.confirmSwitch}
        />
      )}

      {s.unsavedConfirm && (
        <AccountMenuConfirmOverlay
          title={s.discardChangesTitle}
          message={s.discardChangesMessage}
          confirmLabel={s.discardChangesConfirmLabel}
          onCancel={() => s.setUnsavedConfirm(null)}
          onConfirm={() => {
            const action = s.unsavedConfirm;
            s.setUnsavedConfirm(null);
            if (action) s.runPending(action);
          }}
        />
      )}
    </div>
  );
}
