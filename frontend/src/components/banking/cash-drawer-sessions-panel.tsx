"use client";

/** Drawer session list + selected session detail / movements. */

import type {
  CashDrawerSessionDetail,
  CashDrawerSessionRead,
} from "@/lib/banking-types";
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
import { formatTrDate, formatTry } from "@/lib/money";

export type CashDrawerSessionsPanelProps = {
  sessions: CashDrawerSessionRead[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  detail: CashDrawerSessionDetail | null;
  showOpsWrite: boolean;
  onOpenReopen: () => void;
  onCloseDrawer: () => void;
};

export function CashDrawerSessionsPanel({
  sessions,
  selectedId,
  onSelect,
  detail,
  showOpsWrite,
  onOpenReopen,
  onCloseDrawer,
}: CashDrawerSessionsPanelProps) {
  if (sessions.length === 0) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h2 className="mb-3 text-sm font-semibold">Drawer sessions</h2>
        <div className="space-y-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`flex w-full items-center justify-between rounded-lg border border-border p-3 text-left hover:bg-muted/50 ${
                selectedId === s.id ? "bg-muted/50" : ""
              }`}
              onClick={() => onSelect(s.id)}
            >
              <div>
                <p className="text-sm font-medium">
                  {formatTrDate(s.session_date)}
                </p>
                {s.over_short_kurus !== null && (
                  <p className="text-xs text-muted-foreground">
                    Over/short: {formatTry(s.over_short_kurus)}
                  </p>
                )}
              </div>
              <StatusBadge status={s.status} />
            </button>
          ))}
        </div>
      </section>

      {detail && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {formatTrDate(detail.session_date)} detail
            </h2>
            <div className="flex gap-2">
              {detail.status === "closed" && (
                <Button type="button" onClick={onOpenReopen}>
                  Reopen (owner)
                </Button>
              )}
              {detail.status === "open" && showOpsWrite && (
                <Button type="button" onClick={onCloseDrawer}>
                  Close drawer
                </Button>
              )}
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-border bg-card p-4 text-sm">
            {detail.expected_balance_kurus !== null && (
              <p>
                Expected:{" "}
                <span className="tabular-nums font-medium">
                  {formatTry(detail.expected_balance_kurus)}
                </span>
              </p>
            )}
            {detail.counted_balance_kurus !== null && (
              <p>
                Counted:{" "}
                <span className="tabular-nums font-medium">
                  {formatTry(detail.counted_balance_kurus)}
                </span>
              </p>
            )}
            {detail.over_short_kurus !== null && (
              <p>
                Over/short:{" "}
                <span className="tabular-nums font-medium">
                  {formatTry(detail.over_short_kurus)}
                </span>
              </p>
            )}
            {detail.reopen_reason && (
              <p className="mt-2 text-muted-foreground">
                Reopened: {detail.reopen_reason}
              </p>
            )}
          </div>

          {detail.movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No movements linked to this session.
            </p>
          ) : (
            <DataTable>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Date</DataTableHeaderCell>
                  <DataTableHeaderCell>Dir</DataTableHeaderCell>
                  <DataTableHeaderCell>Description</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {detail.movements.map((m) => (
                  <DataTableRow key={m.id}>
                    <DataTableCell>
                      {formatTrDate(m.movement_date)}
                    </DataTableCell>
                    <DataTableCell>{m.direction}</DataTableCell>
                    <DataTableCell>{m.description}</DataTableCell>
                    <DataTableCell align="right">
                      {formatTry(m.amount_kurus)}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          )}
        </section>
      )}
    </div>
  );
}
