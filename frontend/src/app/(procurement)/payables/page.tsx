import { redirect } from "next/navigation";

/** Legacy URL — payables live on the Suppliers directory. */
export default function PayablesRedirect() {
  redirect("/suppliers");
}
