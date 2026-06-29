"use client";

/** Owner-facing expense item list + manual merge. */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { useEntityAccess } from "@/lib/use-entity-access";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export default function ExpenseItemsSettingsPage() {
  const { entityId, actorId } = useEntity();
  const { role } = useEntityAccess();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const owner = canManageExpenseItems(role);

  const [searchText, setSearchText] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<ExpenseItemRow[]>([]);
  const [total, setTotal] = useState(0);
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

  const reload = useCallback(async () => {
    if (!entityId) {
      setItems([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ items: ExpenseItemRow[]; total: number }>(
        expenseItemsListUrl(entityId, debouncedQuery),
      );
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [entityId, debouncedQuery]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setSourceId("");
    setTargetId("");
    setConfirmOpen(false);
    setActionError(null);
  }, [entityId]);

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
          mergeExpenseItemsErrorMessage(
            err.status,
            err.message,
          ),
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
        <Link href="/setup/restaurant" className="text-primary hover:underline">
          ← Settings
        </Link>
      </p>

      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}

      {entityId && !owner && (
        <ForbiddenMessage
          context="expense items"
          detail="Only the restaurant owner can merge expense items. Ask your owner if you need duplicates cleaned up."
        />
      )}

      {entityId && owner && (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            Search existing item names and aliases, then merge duplicates into
            one canonical item. Merging moves all expense entries and
            deactivates the source item.
          </p>

          <div className="mb-4">
            <Label htmlFor="exp-item-search">Search items</Label>
            <Input
              id="exp-item-search"
              placeholder="peynir, yoğurt…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>

          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          {actionError && (
            <p className="mb-4 text-sm text-destructive">{actionError}</p>
          )}

          {loading && <TableSkeleton columns={2} />}

          {!loading && items.length === 0 && (
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

          {!loading && items.length > 0 && (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                {total} item{total === 1 ? "" : "s"}
              </p>
              <DataTable>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Name</DataTableHeaderCell>
                    <DataTableHeaderCell>Status</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <DataTableBody>
                  {items.map((item) => (
                    <DataTableRow key={item.id}>
                      <DataTableCell>{item.canonical_name}</DataTableCell>
                      <DataTableCell>
                        {item.is_active ? "Active" : "Inactive"}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
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

              <div className="mt-4">
                <Button
                  type="button"
                  disabled={!mergeReady}
                  onClick={() => setConfirmOpen(true)}
                >
                  Merge into target
                </Button>
              </div>
            </>
          )}
        </>
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
          <Button type="button" disabled={merging} onClick={() => void handleMerge()}>
            {merging ? "Merging…" : "Merge"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
