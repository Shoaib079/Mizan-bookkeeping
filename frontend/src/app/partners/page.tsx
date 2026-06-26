"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
import { ApiError, apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";

type PartnerListResponse = {
  items: PartnerRow[];
  total: number;
  ownership_share?: {
    total_pct: string | null;
    partners_with_share: number;
    warning: string | null;
  };
};

function formatSharePct(value: string | null): string {
  if (value == null || value === "") return "—";
  return `${value}%`;
}

export default function PartnersPage() {
  const { entityId } = useEntity();
  const [items, setItems] = useState<PartnerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [shareWarning, setShareWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!entityId) {
      setItems([]);
      setTotal(0);
      setShareWarning(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<PartnerListResponse>(
        `/entities/${entityId}/partners?limit=50`,
      );
      setItems(res.items);
      setTotal(res.total);
      setShareWarning(res.ownership_share?.warning ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("You do not have access to partners for this restaurant.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
      setItems([]);
      setTotal(0);
      setShareWarning(null);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

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

      {shareWarning && (
        <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {shareWarning}
        </p>
      )}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={3} />}

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
              <DataTableHeaderCell>Share %</DataTableHeaderCell>
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
                  {formatSharePct(row.ownership_share_pct)}
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
