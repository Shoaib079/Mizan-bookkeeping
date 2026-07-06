"use client";

import { Button } from "@/components/ui/button";
import {
  canEditSubledgerRow,
  type SubledgerDisplayRow,
} from "@/lib/ledger-display";

import { VoidTriggerButton } from "./void-trigger-button";

type Props = {
  row: SubledgerDisplayRow & { journal_entry_id?: string | null };
  onEdit: () => void;
  onVoid: () => void;
  /** When false, only Void is shown (e.g. advance_applied companion rows). */
  showEdit?: boolean;
};

export function SubledgerRowActions({ row, onEdit, onVoid, showEdit = true }: Props) {
  if (!canEditSubledgerRow(row)) return null;
  return (
    <div className="flex justify-end gap-1">
      {showEdit && (
        <Button
          type="button"
          variant="secondary"
          className="h-8 px-2"
          onClick={onEdit}
        >
          Edit
        </Button>
      )}
      <VoidTriggerButton onContinue={onVoid} />
    </div>
  );
}
