"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { PartnerExpenseFrontedForm } from "@/components/forms/partner-expense-fronted-form";
import { PartnerForm, type PartnerRow } from "@/components/forms/partner-form";
import { PartnerReimbursementForm } from "@/components/forms/partner-reimbursement-form";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { partnerMovementLabels } from "@/lib/subledger-labels";

type LedgerEntry = {
  id: string;
  movement_date: string;
  movement_type: string;
  amount_kurus: number;
  description: string;
};

type LedgerResponse = {
  balance_kurus: number;
  entries: LedgerEntry[];
};

export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const partnerId = params.id;
  const { entityId } = useEntity();

  const [partner, setPartner] = useState<PartnerRow | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [reimburseOpen, setReimburseOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!entityId || !partnerId) return;
    setLoading(true);
    setError(null);
    try {
      const [part, led] = await Promise.all([
        apiFetch<PartnerRow>(`/entities/${entityId}/partners/${partnerId}`),
        apiFetch<LedgerResponse>(
          `/entities/${entityId}/partners/${partnerId}/ledger`,
        ),
      ]);
      setPartner(part);
      setLedger(led);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId, partnerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!entityId) {
    return (
      <AppShell title="Partner">
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title={partner?.name ?? "Partner"}>
      <div className="mb-4">
        <Link href="/partners" className="text-sm text-primary hover:underline">
          ← Partners
        </Link>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading partner…</p>
      )}

      {partner && ledger && (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <StatusBadge status={partner.is_active ? "active" : "inactive"} />
              {partner.ownership_share_pct != null && (
                <span className="text-sm text-muted-foreground">
                  Share: {partner.ownership_share_pct}%
                </span>
              )}
              {partner.notes && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {partner.notes}
                </p>
              )}
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">Amount owed</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatTry(ledger.balance_kurus)}
              </p>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button type="button" onClick={() => setExpenseOpen(true)}>
              Expense fronted
            </Button>
            <Button type="button" variant="secondary" onClick={() => setReimburseOpen(true)}>
              Pay reimbursement
            </Button>
          </div>

          <h2 className="mb-2 text-sm font-semibold">Ledger</h2>
          {ledger.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movements yet.</p>
          ) : (
            <DataTable>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Date</DataTableHeaderCell>
                  <DataTableHeaderCell>Type</DataTableHeaderCell>
                  <DataTableHeaderCell>Description</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {ledger.entries.map((entry) => (
                  <DataTableRow key={entry.id}>
                    <DataTableCell>
                      {formatTrDate(entry.movement_date)}
                    </DataTableCell>
                    <DataTableCell>
                      {partnerMovementLabels[entry.movement_type] ??
                        entry.movement_type}
                    </DataTableCell>
                    <DataTableCell>{entry.description}</DataTableCell>
                    <DataTableCell align="right">
                      {formatTry(entry.amount_kurus)}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          )}
        </>
      )}

      {partner && (
        <>
          <PartnerForm
            open={editOpen}
            partner={partner}
            onClose={() => setEditOpen(false)}
            onSaved={() => void reload()}
          />
          <PartnerExpenseFrontedForm
            open={expenseOpen}
            partnerId={partnerId}
            onClose={() => setExpenseOpen(false)}
            onSaved={() => void reload()}
          />
          <PartnerReimbursementForm
            open={reimburseOpen}
            partnerId={partnerId}
            balanceKurus={ledger?.balance_kurus}
            onClose={() => setReimburseOpen(false)}
            onSaved={() => void reload()}
          />
        </>
      )}
    </AppShell>
  );
}
