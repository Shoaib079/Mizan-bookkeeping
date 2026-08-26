"use client";

import { useMemo, useState } from "react";

import { MemberForm } from "@/components/forms/member-form";
import { ForbiddenMessage } from "@/components/reports/forbidden-message";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useEntity } from "@/lib/entity-context";
import { useToast } from "@/lib/toast";
import {
  type EntityRole,
  type MembershipRow,
} from "@/lib/settings-types";
import { useEntityList } from "@/lib/use-entity-list";
import { MemberAccessEditor } from "@/components/settings/member-access-editor";
import { TeamMembersList } from "@/components/settings/team-members-list";
import type { Grant } from "@/lib/member-grants";
import { isOwnerRole } from "@/lib/member-grants";
import { useIsMobileShell } from "@/lib/use-mobile-shell";

export function TeamPanel() {
  const { entityId } = useEntity();
  const isMobile = useIsMobileShell();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { items, loading, error, forbidden, reload } =
    useEntityList<MembershipRow>("/members", entityId);
  const teamMembers = useMemo(
    () => items.filter((row) => row.entity_id === entityId),
    [items, entityId],
  );
  const memberCount = teamMembers.length;
  const [formOpen, setFormOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [accessMember, setAccessMember] = useState<MembershipRow | null>(null);
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  async function onSaveAccess(payload: { role: EntityRole; grants: Grant[] }) {
    if (!entityId || !accessMember) return;
    setAccessSaving(true);
    setAccessError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${entityId}/members/${accessMember.id}`, {
        method: "PATCH",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: payload.role, grants: payload.grants }),
      });
      submitIdempotency.completeSubmit();
      toast("Access updated");
      setAccessMember(null);
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setAccessError("You need owner access to manage members.");
      } else if (err instanceof ApiError && err.status === 422) {
        setAccessError(err.message);
      } else {
        setAccessError(err instanceof Error ? err.message : "Update failed");
      }
    } finally {
      setAccessSaving(false);
    }
  }

  async function onRoleChange(membership: MembershipRow, role: EntityRole) {
    if (!entityId || role === membership.role || isOwnerRole(membership.role)) return;
    setUpdatingId(membership.id);
    setActionError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${entityId}/members/${membership.id}`, {
        method: "PATCH",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      submitIdempotency.completeSubmit();
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setActionError("You need owner access to manage members.");
      } else {
        setActionError(err instanceof Error ? err.message : "Update failed");
      }
    } finally {
      setUpdatingId(null);
    }
  }

  async function onRemove(membership: MembershipRow) {
    if (!entityId) return;
    const label = membership.user.email || membership.user.display_name;
    if (
      !window.confirm(
        `Remove ${label} from this restaurant?\n\nThey will lose access. You can invite them again later.`,
      )
    ) {
      return;
    }
    setUpdatingId(membership.id);
    setActionError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${entityId}/members/${membership.id}`, {
        method: "DELETE",
        idempotencyKey,
      });
      submitIdempotency.completeSubmit();
      toast(`Removed ${label}`);
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setActionError("You need owner access to manage members.");
      } else {
        setActionError(err instanceof Error ? err.message : "Remove failed");
      }
    } finally {
      setUpdatingId(null);
    }
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  if (forbidden) {
    return (
      <ForbiddenMessage
        context="members list"
        detail="You don't have permission to manage members. Only restaurant owners and admins can view or change the team — ask your owner for access."
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {!loading ? `${memberCount} member${memberCount === 1 ? "" : "s"}` : "\u00a0"}
        </p>
        <Button type="button" onClick={() => setFormOpen(true)}>
          Add member
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {actionError && (
        <p className="mb-4 text-sm text-destructive">{actionError}</p>
      )}

      {loading && <TableSkeleton columns={6} />}

      {!loading && teamMembers.length > 0 && (
        <TeamMembersList
          members={teamMembers}
          entityId={entityId}
          updatingId={updatingId}
          isMobile={isMobile}
          onRoleChange={(row, role) => void onRoleChange(row, role)}
          onEditAccess={(row) => {
            setAccessError(null);
            setAccessMember(row);
          }}
          onRemove={(row) => void onRemove(row)}
        />
      )}

      {!loading && teamMembers.length === 0 && !error && (
        <EmptyState
          icon={Users}
          title="No members yet"
          hint="Add a user by email to grant access."
        />
      )}

      {accessMember && (
        <MemberAccessEditor
          key={accessMember.id}
          membership={accessMember}
          open={accessMember !== null}
          saving={accessSaving}
          error={accessError}
          onOpenChange={(open) => {
            if (!open) {
              setAccessMember(null);
              setAccessError(null);
            }
          }}
          onSave={onSaveAccess}
        />
      )}

      <MemberForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </>
  );
}
