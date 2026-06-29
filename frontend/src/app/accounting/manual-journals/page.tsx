import { redirect } from "next/navigation";

/** Legacy URL — UX5 redirect to Set up → Accountant. */
export default function ManualJournalsRedirectPage() {
  redirect("/setup/accountant");
}
