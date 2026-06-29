import { redirect } from "next/navigation";

/** Legacy URL — UX2 redirect to Balances hub. */
export default function PayablesRedirectPage() {
  redirect("/balances/suppliers");
}
