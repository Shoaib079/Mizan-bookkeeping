import { redirect } from "next/navigation";

/** Legacy bookmark — expenses live under Review hub. */
export default function ExpensesPage() {
  redirect("/review/expenses");
}
