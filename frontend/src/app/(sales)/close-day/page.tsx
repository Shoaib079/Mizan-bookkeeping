import { redirect } from "next/navigation";

/** Sales Close day tab retired — use Add → Close day (drawer count). */
export default function CloseDayRedirectPage() {
  redirect("/record");
}
