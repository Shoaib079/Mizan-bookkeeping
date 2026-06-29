import { redirect } from "next/navigation";

/** Legacy URL — UX5 redirect to Set up hub. */
export default function SettingsIndexRedirect() {
  redirect("/setup/restaurant");
}
