import { redirect } from "next/navigation";

/** Was a page of three links into Banking — a menu pointing at a menu. Banking
 * already owns accounts, transfers and the cash drawer, so go straight there. */
export default function BalancesCashRedirect() {
  redirect("/banking");
}
