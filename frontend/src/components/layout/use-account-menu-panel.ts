"use client";

/** State and switch/sign-out flow for AccountMenuPanel. */

import { useCallback, useMemo, useRef, useState } from "react";

import {
  discardChangesConfirmLabel,
  discardChangesMessage,
  discardChangesTitle,
  devModeIdentityLabel,
  switchConfirmMessage,
} from "@/lib/account-menu-helpers";
import { canCreateEntity, canSwitchEntity, canAccessSettings } from "@/lib/entity-access";
import { useEntity } from "@/lib/entity-context";
import { entityAccentColor, userInitials } from "@/lib/entity-visual";
import { useDismissOnOutsideClick } from "@/lib/use-dismiss-on-outside-click";
import { useToast } from "@/lib/toast";
import { useUnsavedWork } from "@/lib/unsaved-work";
import { useEntityAccess } from "@/lib/use-entity-access";

export type PendingAction =
  | { type: "switch"; entityId: string; name: string }
  | { type: "sign-out" };

export function useAccountMenuPanel({
  devMode,
  onSignOut,
}: {
  devMode: boolean;
  onSignOut: (() => void | Promise<void>) | undefined;
}) {
  const { toast } = useToast();
  const { hasUnsavedWork } = useUnsavedWork();
  const {
    entityId,
    setEntityId,
    actorId,
    setActorId,
    entities,
    visibleEntities,
    entitiesLoading,
    entitiesLoaded,
    entitiesError,
    userProfile,
  } = useEntity();
  const { role, grants } = useEntityAccess();
  const canSwitch = canSwitchEntity(grants);
  const canCreate = canCreateEntity(role);
  const showSettings = canAccessSettings(grants);

  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
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
    () =>
      (canSwitch ? entities : visibleEntities).filter(
        (entity) => entity.id !== entityId,
      ),
    [canSwitch, entities, visibleEntities, entityId],
  );

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
      setEntityId(targetId, { redirectToDashboard: true });
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

  const switchConfirmTitle = "Switch restaurant?";
  const switchConfirmBody = activeEntity
    ? switchConfirmMessage(activeEntity.name, switchTarget?.name ?? "")
    : switchTarget
      ? `Switch to ${switchTarget.name}?`
      : "";

  return {
    menuRef,
    open,
    setOpen,
    createOpen,
    setCreateOpen,
    switchTarget,
    setSwitchTarget,
    unsavedConfirm,
    setUnsavedConfirm,
    closeMenu,
    activeEntity,
    otherEntities,
    canSwitch,
    canCreate,
    showSettings,
    displayName,
    email,
    initials,
    avatarColor,
    entityId,
    setEntityId,
    actorId,
    setActorId,
    entities,
    entitiesLoading,
    entitiesLoaded,
    entitiesError,
    onPickRestaurant,
    confirmSwitch,
    onSignOutClick,
    runPending,
    switchConfirmTitle,
    switchConfirmBody,
    discardChangesTitle: discardChangesTitle(),
    discardChangesMessage: discardChangesMessage(),
    discardChangesConfirmLabel: discardChangesConfirmLabel(),
    onSignOut,
    devMode,
  };
}
