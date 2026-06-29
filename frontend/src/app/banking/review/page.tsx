import { redirect } from "next/navigation";

/** Legacy URL — UX3 redirect to Review → Bank & card. */
export default function BankingReviewRedirectPage() {
  redirect("/review/bank");
}
