"use client";

/** Cash drawer sessions, movements, EOD close — Phase 9 Slice 4. */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CashDrawerCloseForm } from "@/components/forms/cash-drawer-close-form";
import { CashMovementForm } from "@/components/forms/cash-movement-form";
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
import type {
  CashDrawerSessionDetail,
  CashDrawerSessionRead,
} from "@/lib/banking-types";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";

export default function CashDrawerPage() {
  const { entityId } = useEntity();
  const [sessions, setSessions] = useState<CashDrawerSessionRead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CashDrawerSessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movementOpen, setMovementOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const reloadSessions = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: CashDrawerSessionRead[] }>(
        `/entities/${entityId}/cash/drawer-sessions?limit=50`,
      );
      setSessions(res.items);
      setSelectedId((prev) => prev ?? res.items[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  const reloadDetail = useCallback(async () => {
    if (!entityId || !selectedId) {
      setDetail(null);
      return;
    }
    try {
      const data = await apiFetch<CashDrawerSessionDetail>(
        `/entities/${entityId}/cash/drawer-sessions/${selectedId}`,
      );
      setDetail(data);
    } catch {
      setDetail(null);
    }
  }, [entityId, selectedId]);

  useEffect(() => {
    void reloadSessions();
  }, [reloadSessions]);

  useEffect(() => {
    void reloadDetail();
  }, [reloadDetail]);

  function onSaved() {
    void reloadSessions();
    void reloadDetail();
  }

  return (
    <AppShell title="Cash drawer">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/banking" className="text-sm text-primary hover:underline">
          ← Banking
        </Link>
        <Button
          type="button"
          disabled={!entityId}
          onClick={() => setMovementOpen(true)}
        >
          Record movement
        </Button>
      </div>

      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading sessions…</p>
      )}

      {sessions.length > 0 && (
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
                  onClick={() => setSelectedId(s.id)}
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
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  {formatTrDate(detail.session_date)} detail
                </h2>
                {detail.status === "open" && (
                  <Button
                    type="button"
                    onClick={() => setCloseOpen(true)}
                  >
                    Close drawer
                  </Button>
                )}
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
              </div>

              {detail.movements.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No movements yet.
                </p>
              ) : (
                <DataTable>
                  <DataTableHead>
                    <tr>
                      <DataTableHeaderCell>Date</DataTableHeaderCell>
                      <DataTableHeaderCell>Dir</DataTableHeaderCell>
                      <DataTableHeaderCell>Description</DataTableHeaderCell>
                      <DataTableHeaderCell align="right">
                        Amount
                      </DataTableHeaderCell>
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
      )}

      {!loading && entityId && sessions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No drawer sessions yet. Record a movement to open today&apos;s session.
        </p>
      )}

      <CashMovementForm
        open={movementOpen}
        onClose={() => setMovementOpen(false)}
        defaultCashAccountId={detail?.money_account_id}
        onSaved={onSaved}
      />
      {detail && detail.status === "open" && (
        <CashDrawerCloseForm
          open={closeOpen}
          onClose={() => setCloseOpen(false)}
          session={detail}
          onClosed={onSaved}
        />
      )}
    </AppShell>
  );
}
