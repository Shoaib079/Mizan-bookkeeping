import type { EntityRole } from "@/lib/settings-types";

export type ExpenseItemRow = {
  id: string;
  canonical_name: string;
  default_expense_account_id: string | null;
  is_active: boolean;
};

export function canManageExpenseItems(role: EntityRole): boolean {
  return role === "owner";
}

export function expenseItemsListUrl(entityId: string, query?: string): string {
  const params = new URLSearchParams({ limit: "50" });
  if (query?.trim()) {
    params.set("q", query.trim());
  }
  return `/entities/${entityId}/expense-items?${params.toString()}`;
}

export function canSubmitExpenseItemMerge(
  sourceId: string | null,
  targetId: string | null,
): boolean {
  return Boolean(sourceId && targetId && sourceId !== targetId);
}

export function mergeExpenseItemsConfirmMessage(
  sourceName: string,
  targetName: string,
): string {
  return `Move all '${sourceName}' entries into '${targetName}' and delete '${sourceName}'? This can't be undone.`;
}

export function buildMergeExpenseItemsPayload(
  sourceId: string,
  targetId: string,
  actorId: string,
) {
  return {
    source_id: sourceId,
    target_id: targetId,
    actor_id: actorId,
  };
}

/** Merge only runs after the owner confirms in the dialog. */
export function shouldRunExpenseItemMerge(
  confirmed: boolean,
  sourceId: string | null,
  targetId: string | null,
): boolean {
  return confirmed && canSubmitExpenseItemMerge(sourceId, targetId);
}

export function mergeExpenseItemsErrorMessage(
  status: number,
  detail?: string,
): string {
  if (status === 404) {
    return "Expense item not found — refresh the list and try again.";
  }
  if (status === 422) {
    return detail || "These items cannot be merged.";
  }
  return detail || "Merge failed.";
}
