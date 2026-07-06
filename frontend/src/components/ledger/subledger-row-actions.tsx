"use client";

import { Button } from "@/components/ui/button";
import {
  canEditSubledgerRow,
  type SubledgerDisplayRow,
} from "@/lib/ledger-display";

type Props = {
  row: SubledgerDisplayRow & { journal_entry_id?: string | null };
  onEdit: () => void;
  onVoid: () => void;
};

export function SubledgerRowActions({ row, onEdit, onVoid }: Props) {
  if (!canEditSubledgerRow(row)) return null;
  return (
    <div className="flex justify-end gap-1">
      <Button
        type="button"
        variant="secondary"
        className="h-8 px-2"
        onClick={onEdit}
      >
        Edit
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-8 px-2 text-destructive hover:text-destructive"
        onClick={onVoid}
      >
        Void
      </Button>
    </div>
  );
}
