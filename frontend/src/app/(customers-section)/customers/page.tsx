"use client";

import Link from "next/link";
import { useState } from "react";

import { CustomerForm, type CustomerRow } from "@/components/forms/customer-form";
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
import { UserCircle } from "lucide-react";
import { useEntity } from "@/lib/entity-context";
import { useEntityList } from "@/lib/use-entity-list";

export default function CustomersPage() {
  const { entityId } = useEntity();
  const { items, total, loading, error, reload } = useEntityList<CustomerRow>(
    "/customers",
    entityId,
  );
  const [formOpen, setFormOpen] = useState(false);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {entityId
            ? `${total} customer${total === 1 ? "" : "s"}`
            : "Select a restaurant in the sidebar"}
        </p>
        <Button type="button" disabled={!entityId} onClick={() => setFormOpen(true)}>
          New customer
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={3} />}

      {!loading && entityId && items.length === 0 && (
        <EmptyState
          icon={UserCircle}
          title="No customers yet"
          hint="Add customers for credit sales and payments."
        />
      )}

      {items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Name</DataTableHeaderCell>
              <DataTableHeaderCell>Identifier</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>
                  <Link
                    href={`/customers/${row.id}`}
                    className="text-primary hover:underline"
                  >
                    {row.name}
                  </Link>
                </DataTableCell>
                <DataTableCell>{row.identifier ?? "—"}</DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.is_active ? "active" : "inactive"} />
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Outstanding balances across all customers are on{" "}
        <Link href="/balances/customers" className="text-primary hover:underline">
          Receivables
        </Link>
        .
      </p>

      <CustomerForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </>
  );
}
