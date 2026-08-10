"use client";

import { useCallback, useEffect, useState } from "react";

import { GroupSaleForm } from "@/components/forms/group-sale-form";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { type GroupSaleRead } from "@/lib/group-sales-types";

/** Opens the group sale edit form from an id alone.
 *
 * Every other edit kind arrives from the ledger with everything its form needs
 * already in the context — a date, an amount, an account. A group sale cannot
 * work that way: the form is a whole document, with one row per menu line,
 * pax and rate on each, a currency and possibly an FX rate. Copying that into
 * the edit context would mean the ledger reassembling a shape the sale detail
 * page already knows how to fetch, and the two would drift the first time a
 * column was added to a line.
 *
 * So this fetches the sale and hands it over unchanged. `GroupSaleForm` is
 * untouched: it already accepts `correcting` and posts to
 * `group-sales/{id}/correct`, which is how the sale detail page has always
 * edited one. The General ledger was the only caller without the object in
 * hand, and that was the whole of the gap.
 *
 * Until this existed, `startEdit` reached its `default` arm for `group_sale`
 * and said so in a toast. That was the honest behaviour for an unwired kind,
 * but it is still an Edit button that does not edit.
 */
export function GroupSaleEditLoader({
  open,
  groupSaleId,
  onClose,
  onSaved,
}: {
  open: boolean;
  groupSaleId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { entityId } = useEntity();
  const [sale, setSale] = useState<GroupSaleRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!open || !entityId || !groupSaleId) return;
    setError(null);
    setSale(null);
    try {
      setSale(
        await apiFetch<GroupSaleRead>(
          `/entities/${entityId}/group-sales/${groupSaleId}`,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the sale");
    }
  }, [entityId, groupSaleId, open]);

  useEffect(() => {
    void load();
  }, [load]);

  // While it loads, and if it fails, say so rather than showing nothing. An
  // Edit press that opens no window is indistinguishable from a broken button
  // — which is exactly what this kind looked like before it was wired.
  if (open && sale === null) {
    return (
      <Dialog open title="Correct group sale" onClose={onClose} size="compact">
        <p className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {error ?? "Loading the sale…"}
        </p>
      </Dialog>
    );
  }

  if (!open || sale === null) return null;

  return (
    <GroupSaleForm
      open
      correcting={sale}
      customerId={sale.customer_id}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
