"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StatementUploadForm } from "@/components/forms/statement-upload-form";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";

type MoneyAccountRow = {
  id: string;
  name: string;
  account_kind: string;
  is_active?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function BankAccountPickerDialog({ open, onClose }: Props) {
  const { entityId } = useEntity();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<MoneyAccountRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const reset = useCallback(() => {
    setAccounts([]);
    setSelectedId("");
    setLoadError(null);
    setLoading(false);
    setUploadOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    if (!entityId) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void apiFetch<{ items: MoneyAccountRow[] }>(
      `/entities/${entityId}/banking/accounts?account_kind=bank&limit=50`,
    )
      .then((res) => {
        if (cancelled) return;
        const items = res.items.filter((row) => row.is_active !== false);
        setAccounts(items);
        if (items[0]) setSelectedId(items[0].id);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load accounts");
        setAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, entityId, reset]);

  const options = useMemo(
    () => accounts.map((account) => ({ value: account.id, label: account.name })),
    [accounts],
  );

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <>
      <Dialog open={open && !uploadOpen} title="Bank statement" onClose={handleClose}>
        {!entityId && (
          <p className="text-sm text-muted-foreground">
            Select a restaurant in the sidebar first.
          </p>
        )}

        {entityId && loading && (
          <p className="text-sm text-muted-foreground">Loading bank accounts…</p>
        )}

        {entityId && !loading && loadError && (
          <p className="text-sm text-destructive">{loadError}</p>
        )}

        {entityId && !loading && !loadError && accounts.length === 0 && (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              No bank account found. Add one under{" "}
              <Link href="/banking" className="text-primary hover:underline">
                Banking
              </Link>{" "}
              first.
            </p>
            <Button type="button" variant="ghost" onClick={handleClose}>
              Close
            </Button>
          </div>
        )}

        {entityId && !loading && accounts.length > 0 && (
          <div className="space-y-4">
            <div>
              <Label>Bank account</Label>
              <Combobox
                value={selectedId}
                onValueChange={setSelectedId}
                options={options}
                placeholder="Choose account…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!selectedId}
                onClick={() => setUploadOpen(true)}
              >
                Continue
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <StatementUploadForm
        open={uploadOpen}
        moneyAccountId={selectedId}
        onClose={() => {
          setUploadOpen(false);
          handleClose();
        }}
      />
    </>
  );
}
