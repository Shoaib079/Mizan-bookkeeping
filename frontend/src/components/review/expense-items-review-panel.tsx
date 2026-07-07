"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Select } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Tags } from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api";
import {
  buildMergeExpenseItemsPayload,
  canManageExpenseItems,
  canSubmitExpenseItemMerge,
  expenseItemsListUrl,
  mergeExpenseItemsConfirmMessage,
  mergeExpenseItemsErrorMessage,
  shouldRunExpenseItemMerge,
  type ExpenseItemRow,
} from "@/lib/expense-item-merge";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import type { TimeSeriesRead } from "@/lib/report-types";
import { useEntityAccess } from "@/lib/use-entity-access";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Props = {
  from: string;
  to: string;
  highlightItemId: string | null;
  onDrillDown: (itemId: string, itemName: string) => void;
  onTotalsChange: (totalKurus: number) => void;
  onLoadingChange?: (loading: boolean) => void;
};

type ItemRow = ExpenseItemRow & {
  postedTotalKurus: number;
};

export function ExpenseItemsReviewPanel({
  from,
  to,
  highlightItemId,
  onDrillDown,
  onTotalsChange,
  onLoadingChange,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { role } = useEntityAccess();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const owner = canManageExpenseItems(role);
  const [searchText, setSearchText] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<ExpenseItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [postedByItem, setPostedByItem] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchText), 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    setSourceId("");
    setTargetId("");
    setConfirmOpen(false);
    setActionError(null);
    setSearchText("");
    setDebouncedQuery("");
  }, [entityId]);

  const reload = useCallback(async () => {
    if (!entityId) {
      setItems([]);
      setTotal(0);
      setPostedByItem(new Map());
      onTotalsChange(0);
      return;
    }
    setLoading(true);
    onLoadingChange?.(true);
    setError(null);
    try {
      const [itemsRes, timeSeries] = await Promise.all([
        apiFetch<{ items: ExpenseItemRow[]; total: number }>(
          expenseItemsListUrl(entityId, debouncedQuery),
        ),
        apiFetch<TimeSeriesRead>(
          `/entities/${entityId}/reports/time-series?from=${from}&to=${to}`,
        ),
      ]);
      const totals = new Map(
        timeSeries.expenses_by_item.map((row) => [
          row.expense_item_id,
          row.total_kurus,
        ]),
      );
      setItems(itemsRes.items);
      setTotal(itemsRes.total);
      setPostedByItem(totals);
      onTotalsChange(
        timeSeries.expenses_by_item.reduce(
          (sum, row) => sum + row.total_kurus,
          0,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
      setItems([]);
      setTotal(0);
      setPostedByItem(new Map());
      onTotalsChange(0);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [debouncedQuery, entityId, from, onLoadingChange, onTotalsChange, to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!highlightItemId || loading) return;
    document
      .getElementById(`item-${highlightItemId}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightItemId, items, loading]);

  const rows = useMemo<ItemRow[]>(() => {
    const mapped = items.map((item) => ({
      ...item,
      postedTotalKurus: postedByItem.get(item.id) ?? 0,
    }));
    return mapped.sort((a, b) => {
      if (b.postedTotalKurus !== a.postedTotalKurus) {
        return b.postedTotalKurus - a.postedTotalKurus;
      }
      return a.canonical_name.localeCompare(b.canonical_name, "tr");
    });
  }, [items, postedByItem]);

  const sourceItem = useMemo(
    () => items.find((item) => item.id === sourceId) ?? null,
    [items, sourceId],
  );
  const targetItem = useMemo(
    () => items.find((item) => item.id === targetId) ?? null,
    [items, targetId],
  );

  const mergeReady = canSubmitExpenseItemMerge(sourceId || null, targetId || null);

  async function handleMerge() {
    if (
      !entityId ||
      !shouldRunExpenseItemMerge(confirmOpen, sourceId || null, targetId || null)
    ) {
      return;
    }
    setMerging(true);
    setActionError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await apiFetch(`/entities/${entityId}/expense-items/merge`, {
        method: "POST",
        idempotencyKey,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildMergeExpenseItemsPayload(sourceId, targetId, actorId),
        ),
      });
      submitIdempotency.completeSubmit();
      setConfirmOpen(false);
      setSourceId("");
      setTargetId("");
      toast("Expense items merged");
      await reload();
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(
          mergeExpenseItemsErrorMessage(err.status, err.message),
        );
      } else {
        setActionError(err instanceof Error ? err.message : "Merge failed");
      }
    } finally {
      setMerging(false);
    }
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Canonical item names from manual expenses and receipt lines. Posted
        spend is for the selected date range. Click a row to see its expenses.
      </p>

      <div className="mb-4">
        <Label htmlFor="exp-item-search">Search items</Label>
        <Input
          id="exp-item-search"
          placeholder="peynir, yoğurt…"
          value={searchText}
          disabled={loading}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {actionError && (
        <p className="mb-4 text-sm text-destructive">{actionError}</p>
      )}

      {loading && <TableSkeleton columns={3} />}

      {!loading && rows.length === 0 && (
        <EmptyState
          icon={Tags}
          title="No expense items"
          hint={
            debouncedQuery
              ? "No items match your search."
              : "Items appear when you record manual expenses."
          }
        />
      )}

      {!loading && rows.length > 0 && (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {total} item{total === 1 ? "" : "s"}
          </p>
          <DataTable>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Name</DataTableHeaderCell>
                <DataTableHeaderCell align="right">
                  Posted in period
                </DataTableHeaderCell>
                <DataTableHeaderCell>Status</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {rows.map((item) => (
                <DataTableRow
                  key={item.id}
                  id={`item-${item.id}`}
                  className={cn(
                    "cursor-pointer hover:bg-muted/50",
                    highlightItemId === item.id && "bg-muted/60",
                  )}
                  onClick={() => onDrillDown(item.id, item.canonical_name)}
                >
                  <DataTableCell>{item.canonical_name}</DataTableCell>
                  <DataTableCell align="right">
                    {item.postedTotalKurus > 0
                      ? formatTry(item.postedTotalKurus)
                      : "—"}
                  </DataTableCell>
                  <DataTableCell>
                    {item.is_active ? "Active" : "Inactive"}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        </>
      )}

      {owner && !loading && rows.length > 0 && (
        <div className="mt-6 space-y-3 border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">
            Merge duplicates into one canonical item. All expense entries move to
            the target; the source is deactivated.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="merge-source">Source (merge from)</Label>
              <Select
                id="merge-source"
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
              >
                <option value="">Select source…</option>
                {items
                  .filter((item) => item.is_active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.canonical_name}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="merge-target">Target (merge into)</Label>
              <Select
                id="merge-target"
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
              >
                <option value="">Select target…</option>
                {items
                  .filter((item) => item.is_active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.canonical_name}
                    </option>
                  ))}
              </Select>
            </div>
          </div>
          <Button
            type="button"
            disabled={!mergeReady}
            onClick={() => setConfirmOpen(true)}
          >
            Merge into target
          </Button>
        </div>
      )}

      <Dialog
        open={confirmOpen}
        title="Merge expense items?"
        onClose={() => !merging && setConfirmOpen(false)}
      >
        {sourceItem && targetItem && (
          <p className="text-sm text-muted-foreground">
            {mergeExpenseItemsConfirmMessage(
              sourceItem.canonical_name,
              targetItem.canonical_name,
            )}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={merging}
            onClick={() => setConfirmOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={merging}
            onClick={() => void handleMerge()}
          >
            {merging ? "Merging…" : "Merge"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
