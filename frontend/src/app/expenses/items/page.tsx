import { redirect } from "next/navigation";

import { REVIEW_EXPENSES_ITEMS_HREF } from "@/lib/use-expenses-review-url";

/** Legacy bookmark — expense items live under Review → Expenses. */
export default function ExpenseItemsPage() {
  redirect(REVIEW_EXPENSES_ITEMS_HREF);
}
