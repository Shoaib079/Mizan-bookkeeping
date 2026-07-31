import { redirect } from "next/navigation";

/** Legacy URL — balances overview lives on the dashboard. */
export default function BalancesIndexRedirect() {
  redirect("/");
}
