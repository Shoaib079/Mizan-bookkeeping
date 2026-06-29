import { redirect } from "next/navigation";

/** Legacy URL — UX2 redirect to Balances hub. */
export default function ReceivablesRedirectPage() {
  redirect("/balances/customers");
}
