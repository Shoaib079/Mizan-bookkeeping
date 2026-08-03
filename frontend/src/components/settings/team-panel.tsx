"use client";

import { useState } from "react";

import { MemberForm } from "@/components/forms/member-form";
import { ForbiddenMessage } from "@/components/reports/forbidden-message";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/input";
import { Users } from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useEntity } from "@/lib/entity-context";
import { useToast } from "@/lib/toast";
import {
  ENTITY_ROLES,
  type EntityRole,
  type MembershipRow,
} from "@/lib/settings-types";
import { useEntityList } from "@/lib/use-entity-list";

export function TeamPanel() {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { items, total, loading, error, forbidden, reload } =
    useEntityList<MembershipRow>("/members", entityId);
  const [formOpen, setFormOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function onRoleChange(membership: MembershipRow, role: EntityRole) {
    if (!entityId || role === membership.role) return;
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
          {!loading ? `${total} member${total === 1 ? "" : "s"}` : "\u00a0"}
        </p>
        <Button type="button" onClick={() => setFormOpen(true)}>
          Add member
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {actionError && (
        <p className="mb-4 text-sm text-destructive">{actionError}</p>
      )}

      {loading && <TableSkeleton columns={5} />}

      {!loading && items.length > 0 && (
        <DataTable tableClassName="min-w-[40rem]">
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Name</DataTableHeaderCell>
              <DataTableHeaderCell>Email</DataTableHeaderCell>
              <DataTableHeaderCell>Role</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell align="right"> </DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell className="max-w-[10rem] truncate">
                  {row.user.display_name}
                </DataTableCell>
                <DataTableCell className="max-w-[14rem] truncate">
                  <span title={row.user.email ?? undefined}>{row.user.email}</span>
                </DataTableCell>
                <DataTableCell>
                  <Select
                    value={row.role}
                    disabled={updatingId === row.id}
                    onChange={(e) =>
                      void onRoleChange(row, e.target.value as EntityRole)
                    }
                    className="w-full min-w-[10rem] max-w-[12rem]"
                  >
                    {ENTITY_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </DataTableCell>
                <DataTableCell className="whitespace-nowrap">
                  {row.user.is_active ? "Active" : "Inactive"}
                </DataTableCell>
                <DataTableCell align="right" className="whitespace-nowrap">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={updatingId === row.id}
                    onClick={() => void onRemove(row)}
                  >
                    Remove
                  </Button>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      {!loading && items.length === 0 && !error && (
        <EmptyState
          icon={Users}
          title="No members yet"
          hint="Add a user by email to grant access."
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
