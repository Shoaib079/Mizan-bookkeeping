"use client";

import Link from "next/link";
import { useState } from "react";

import { PartnerForm, type PartnerRow } from "@/components/forms/partner-form";
import { AppShell } from "@/components/layout/app-shell";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { Handshake } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { useEntityList } from "@/lib/use-entity-list";

export default function PartnersPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error, reload } = useEntityList<PartnerRow>(
    "/partners",
    entityId,
  );
  const [formOpen, setFormOpen] = useState(false);

  return (
    <AppShell title="Partners">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? `${total} partner${total === 1 ? "" : "s"}`
            : "Select a restaurant in the sidebar"}
        </p>
        <Button type="button" disabled={!entityId} onClick={() => setFormOpen(true)}>
          New partner
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={2} />}

      {!loading && entityId && items.length === 0 && (
        <EmptyState
          icon={Handshake}
          title="No partners yet"
          hint="Track expenses fronted by owners and reimbursements."
        />
      )}

      {items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Name</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>
                  <Link
                    href={`/partners/${row.id}`}
                    className="text-primary hover:underline"
                  >
                    {row.name}
                  </Link>
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.is_active ? "active" : "inactive"} />
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <PartnerForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </AppShell>
  );
}
