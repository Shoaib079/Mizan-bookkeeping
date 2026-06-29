import { redirect } from "next/navigation";

/** Legacy URL — UX6 redirect to Record hub. */
export default function UploadsRedirectPage() {
  redirect("/record");
}
