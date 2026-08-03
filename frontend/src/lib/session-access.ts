/** Global session access — live membership sync, forced sign-out on revoke. */

import { ApiError } from "@/lib/api";
import { ENTITY_ROLES, type EntityRole } from "@/lib/settings-types";

export type SessionRevokeReason = "inactive" | "removed" | "unprovisioned";

/** Background poll for role changes and access revocation (~15s). */
export const MEMBERSHIP_SYNC_POLL_MS = 15_000;
export const SESSION_ACCESS_POLL_MS = MEMBERSHIP_SYNC_POLL_MS;

export function sessionRevokeReasonFromMessage(
  message: string,
): SessionRevokeReason | null {
  const normalized = message.toLowerCase();
  if (normalized.includes("user is inactive")) return "inactive";
  if (normalized.includes("not a member of this entity")) return "removed";
  if (
    normalized.includes("not provisioned") ||
    normalized.includes("user is not provisioned")
  ) {
    return "unprovisioned";
  }
  return null;
}

export function isSessionRevokedError(err: unknown): SessionRevokeReason | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status !== 403) return null;
  return sessionRevokeReasonFromMessage(err.message);
}

export function sessionRevokeUserMessage(reason: SessionRevokeReason): string {
  switch (reason) {
    case "inactive":
      return "Your account was deactivated. Sign in again after your owner re-enables you.";
    case "removed":
      return "You no longer have access to this restaurant. Sign in again if you were re-invited.";
    case "unprovisioned":
      return "Your sign-in is no longer valid for this app. Contact your restaurant owner.";
  }
}

type SessionRevokeHandler = (
  reason: SessionRevokeReason,
  message: string,
) => void;

let revokeHandler: SessionRevokeHandler | null = null;
let revokeInFlight = false;

export function registerSessionRevokeHandler(
  handler: SessionRevokeHandler | null,
): void {
  revokeHandler = handler;
}

/** Idempotent — only one forced sign-out runs at a time. */
export function notifySessionRevoked(
  reason: SessionRevokeReason,
  detail?: string,
): void {
  if (revokeInFlight || !revokeHandler) return;
  revokeInFlight = true;
  const message = detail?.trim() || sessionRevokeUserMessage(reason);
  revokeHandler(reason, message);
}

export function resetSessionRevokeGuard(): void {
  revokeInFlight = false;
}

function roleLabel(role: EntityRole): string {
  return ENTITY_ROLES.find((row) => row.value === role)?.label ?? role;
}

export function roleChangeUserMessage(
  _previous: EntityRole,
  next: EntityRole,
): string {
  return `Your access was updated to ${roleLabel(next)}.`;
}

type RoleChangeHandler = (
  previous: EntityRole,
  next: EntityRole,
  message: string,
) => void;

let roleChangeHandler: RoleChangeHandler | null = null;

export function registerRoleChangeHandler(
  handler: RoleChangeHandler | null,
): void {
  roleChangeHandler = handler;
}

export function notifyRoleChanged(
  previous: EntityRole,
  next: EntityRole,
): void {
  if (previous === next || !roleChangeHandler) return;
  roleChangeHandler(previous, next, roleChangeUserMessage(previous, next));
}
