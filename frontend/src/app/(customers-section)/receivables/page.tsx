import { redirect } from "next/navigation";

/** Legacy URL — receivables live on the Customers directory. */
export default function ReceivablesRedirect() {
  redirect("/customers");
}
