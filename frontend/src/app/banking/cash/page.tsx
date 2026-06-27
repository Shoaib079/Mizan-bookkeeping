"use client";

/** Cash drawer sessions, movements, EOD close — Phase 9 Slice 4 / 11.13 optional session. */

import Link from "next/link";
import { Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CashDrawerCloseDayForm } from "@/components/forms/cash-drawer-close-day-form";
import { CashDrawerCloseForm } from "@/components/forms/cash-drawer-close-form";
import { CashMovementForm } from "@/components/forms/cash-movement-form";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/skeleton";
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
import { useEntitySwitchReset } from "@/lib/use-entity-reset";
import { formatTrDate, formatTry } from "@/lib/money";

export default function CashDrawerPage() {
  const { entityId, actorId } = useEntity();
  const [sessions, setSessions] = useState<CashDrawerSessionRead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CashDrawerSessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movementOpen, setMovementOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeDayOpen, setCloseDayOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);

  const resetPageState = useCallback(() => {
    setSessions([]);
    setSelectedId(null);
    setDetail(null);
    setLoading(true);
    setError(null);
    setMovementOpen(false);
    setCloseOpen(false);
    setCloseDayOpen(false);
    setReopenOpen(false);
    setReopenReason("");
    setReopenError(null);
    setReopening(false);
  }, []);

  useEntitySwitchReset(entityId, resetPageState);

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

  async function onReopenSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!entityId || !detail) return;
    const reason = reopenReason.trim();
    if (!reason) return;
    setReopening(true);
    setReopenError(null);
    try {
      await apiFetch(
        `/entities/${entityId}/cash/drawer-sessions/${detail.id}/reopen`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason,
            actor_id: actorId,
          }),
        },
      );
      setReopenOpen(false);
      setReopenReason("");
      onSaved();
    } catch (err) {
      setReopenError(err instanceof Error ? err.message : "Reopen failed");
    } finally {
      setReopening(false);
    }
  }

  return (
    <AppShell title="Cash drawer">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/banking" className="text-sm text-primary hover:underline">
          ← Banking
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!entityId}
            onClick={() => setCloseDayOpen(true)}
          >
            Close drawer day
          </Button>
          <Button
            type="button"
            disabled={!entityId}
            onClick={() => setMovementOpen(true)}
          >
            Record movement
          </Button>
        </div>
      </div>

      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={2} rows={4} />}

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
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  {formatTrDate(detail.session_date)} detail
                </h2>
                <div className="flex gap-2">
                  {detail.status === "closed" && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setReopenReason("");
                        setReopenError(null);
                        setReopenOpen(true);
                      }}
                    >
                      Reopen (owner)
                    </Button>
                  )}
                  {detail.status === "open" && (
                    <Button type="button" onClick={() => setCloseOpen(true)}>
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
        <EmptyState
          icon={Wallet}
          title="No drawer sessions yet"
          hint="Record cash movements anytime. Use Close drawer day when you want an EOD count and over/short."
        />
      )}

      <CashMovementForm
        open={movementOpen}
        onClose={() => setMovementOpen(false)}
        defaultCashAccountId={detail?.money_account_id}
        onSaved={onSaved}
      />
      <CashDrawerCloseDayForm
        open={closeDayOpen}
        onClose={() => setCloseDayOpen(false)}
        defaultCashAccountId={detail?.money_account_id}
        defaultSessionDate={detail?.session_date}
        onClosed={onSaved}
      />
      {detail && detail.status === "open" && (
        <CashDrawerCloseForm
          open={closeOpen}
          onClose={() => setCloseOpen(false)}
          session={detail}
          onClosed={onSaved}
        />
      )}

      <Dialog
        open={reopenOpen}
        title="Reopen closed drawer day"
        onClose={() => setReopenOpen(false)}
      >
        <form onSubmit={onReopenSubmit} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Owner only. Reopening is audited — provide a reason, same as period
            unlock.
          </p>
          <div>
            <Label htmlFor="drawer-reopen-reason">Reason</Label>
            <Input
              id="drawer-reopen-reason"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Why reopen this drawer day?"
              required
              autoFocus
            />
          </div>
          {reopenError && (
            <p className="text-sm text-destructive">{reopenError}</p>
          )}
          <Button type="submit" disabled={reopening || !reopenReason.trim()}>
            {reopening ? "Reopening…" : "Reopen drawer day"}
          </Button>
        </form>
      </Dialog>
    </AppShell>
  );
}
