"use client";

import { useState } from "react";

import { ExpenseItemTypeahead } from "@/components/forms/expense-item-typeahead";
import { Button } from "@/components/ui/button";
import type { ExpenseItemSearchResult } from "@/lib/expense-item-search";

type Props = {
  entityId: string;
  itemId: string | null;
  itemName: string | null;
  disabled?: boolean;
  onPick: (item: ExpenseItemSearchResult) => void;
  onClear: () => void;
};

export function ExpenseItemFilterPicker({
  entityId,
  itemId,
  itemName,
  disabled,
  onPick,
  onClear,
}: Props) {
  const [draft, setDraft] = useState("");

  if (itemId) {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Item</p>
          <p className="text-sm font-medium">{itemName ?? "Selected item"}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-9"
          disabled={disabled}
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
    );
  }

  return (
    <div className="min-w-[12rem] max-w-xs">
      <ExpenseItemTypeahead
        entityId={entityId}
        id="exp-review-item-filter"
        label="Filter by item"
        value={draft}
        disabled={disabled}
        onValueChange={setDraft}
        onPickItem={onPick}
      />
    </div>
  );
}
