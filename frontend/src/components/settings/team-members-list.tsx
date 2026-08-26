"use client";

/** Team members list — desktop table / phone cards. */

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
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
import {
  ENTITY_ROLES,
  type EntityRole,
  type MembershipRow,
} from "@/lib/settings-types";
import { isOwnerRole } from "@/lib/member-grants";

type Props = {
  members: MembershipRow[];
  entityId: string;
  updatingId: string | null;
  isMobile: boolean;
  onRoleChange: (membership: MembershipRow, role: EntityRole) => void;
  onEditAccess: (membership: MembershipRow) => void;
  onRemove: (membership: MembershipRow) => void;
};

function roleLabel(role: EntityRole): string {
  return ENTITY_ROLES.find((r) => r.value === role)?.label ?? role;
}

export function TeamMembersList({
  members,
  entityId,
  updatingId,
  isMobile,
  onRoleChange,
  onEditAccess,
  onRemove,
}: Props) {
  if (isMobile) {
    return (
      <MobileCardList key={entityId}>
        {members.map((row) => (
          <MobileCardRow
            key={row.id}
            title={row.user.display_name}
            meta={
              <>
                <span className="truncate" title={row.user.email ?? undefined}>
                  {row.user.email}
                </span>
                <span>·</span>
                <span>
                  {isOwnerRole(row.role) ? "Owner" : roleLabel(row.role)}
                </span>
                <span>·</span>
                <span>{row.user.is_active ? "Active" : "Inactive"}</span>
              </>
            }
            trailing={
              <div className="flex flex-col items-end gap-1">
                {!isOwnerRole(row.role) && (
                  <Select
                    value={row.role}
                    disabled={updatingId === row.id}
                    onChange={(e) =>
                      void onRoleChange(row, e.target.value as EntityRole)
                    }
                    className="w-full min-w-[9rem] max-w-[11rem]"
                  >
                    {ENTITY_ROLES.filter((r) => r.value !== "owner").map(
                      (r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ),
                    )}
                  </Select>
                )}
                {!isOwnerRole(row.role) ? (
                  <Button
                    type="button"
                    className="h-8 px-2 text-xs"
                    disabled={updatingId === row.id}
                    onClick={() => onEditAccess(row)}
                  >
                    Edit access
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Full access
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-2 text-xs"
                  disabled={updatingId === row.id}
                  onClick={() => void onRemove(row)}
                >
                  Remove
                </Button>
              </div>
            }
          />
        ))}
      </MobileCardList>
    );
  }

  return (
    <DataTable key={entityId} tableClassName="min-w-[40rem]">
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Name</DataTableHeaderCell>
          <DataTableHeaderCell>Email</DataTableHeaderCell>
          <DataTableHeaderCell>Role</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
          <DataTableHeaderCell>Access</DataTableHeaderCell>
          <DataTableHeaderCell align="right"> </DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {members.map((row) => (
          <DataTableRow key={row.id}>
            <DataTableCell className="max-w-[10rem] truncate">
              {row.user.display_name}
            </DataTableCell>
            <DataTableCell className="max-w-[14rem] truncate">
              <span title={row.user.email ?? undefined}>{row.user.email}</span>
            </DataTableCell>
            <DataTableCell>
              {isOwnerRole(row.role) ? (
                <span className="text-sm font-medium">Owner</span>
              ) : (
                <Select
                  value={row.role}
                  disabled={updatingId === row.id}
                  onChange={(e) =>
                    void onRoleChange(row, e.target.value as EntityRole)
                  }
                  className="w-full min-w-[10rem] max-w-[12rem]"
                >
                  {ENTITY_ROLES.filter((r) => r.value !== "owner").map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              )}
            </DataTableCell>
            <DataTableCell className="whitespace-nowrap">
              {row.user.is_active ? "Active" : "Inactive"}
            </DataTableCell>
            <DataTableCell className="whitespace-nowrap">
              {isOwnerRole(row.role) ? (
                <span className="text-sm text-muted-foreground">
                  Full access
                </span>
              ) : (
                <Button
                  type="button"
                  disabled={updatingId === row.id}
                  onClick={() => onEditAccess(row)}
                >
                  Edit access
                </Button>
              )}
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
  );
}
