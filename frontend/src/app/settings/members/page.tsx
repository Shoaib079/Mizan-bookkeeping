"use client";

/** Members & roles — Phase 9 Slice 9. */

import Link from "next/link";
import { useState } from "react";

import { MemberForm } from "@/components/forms/member-form";
import { AppShell } from "@/components/layout/app-shell";
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
import { Select } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import {
  ENTITY_ROLES,
  type EntityRole,
  type MembershipRow,
} from "@/lib/settings-types";
import { useEntityList } from "@/lib/use-entity-list";

export default function MembersPage() {
  const { entityId } = useEntity();
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
      await apiFetch(`/entities/${entityId}/members/${membership.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
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

  return (
    <AppShell title="Members & roles">
      <p className="mb-4 text-sm text-muted-foreground">
        <Link href="/settings" className="text-primary hover:underline">
          ← Settings
        </Link>
      </p>

      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}

      {entityId && forbidden && (
        <ForbiddenMessage
          context="members list"
          detail="You don't have permission to manage members. Only restaurant owners and admins can view or change the team — ask your owner for access."
        />
      )}

      {entityId && !forbidden && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {loading
                ? "Loading…"
                : `${total} member${total === 1 ? "" : "s"}`}
            </p>
            <Button type="button" onClick={() => setFormOpen(true)}>
              Add member
            </Button>
          </div>

          {error && (
            <p className="mb-4 text-sm text-destructive">{error}</p>
          )}
          {actionError && (
            <p className="mb-4 text-sm text-destructive">{actionError}</p>
          )}

          {items.length > 0 && (
            <DataTable>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Name</DataTableHeaderCell>
                  <DataTableHeaderCell>Email</DataTableHeaderCell>
                  <DataTableHeaderCell>Role</DataTableHeaderCell>
                  <DataTableHeaderCell>Status</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {items.map((row) => (
                  <DataTableRow key={row.id}>
                    <DataTableCell>{row.user.display_name}</DataTableCell>
                    <DataTableCell>{row.user.email}</DataTableCell>
                    <DataTableCell>
                      <Select
                        value={row.role}
                        disabled={updatingId === row.id}
                        onChange={(e) =>
                          void onRoleChange(row, e.target.value as EntityRole)
                        }
                        className="max-w-[12rem]"
                      >
                        {ENTITY_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </Select>
                    </DataTableCell>
                    <DataTableCell>
                      {row.user.is_active ? "Active" : "Inactive"}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          )}

          {!loading && items.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">
              No members listed yet. Add a user by email to grant access.
            </p>
          )}
        </>
      )}

      <MemberForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </AppShell>
  );
}
