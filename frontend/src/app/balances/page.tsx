import { redirect } from "next/navigation";

/** Legacy URL — Right now lives on the dashboard (same as desktop). */
export default function BalancesPage() {
  redirect("/");
}
