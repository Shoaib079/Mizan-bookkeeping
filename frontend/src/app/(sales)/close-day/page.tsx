import { redirect } from "next/navigation";

/** Sales Close day tab retired — use Record → Count cash, then Close day. */
export default function CloseDayRedirectPage() {
  redirect("/record");
}
