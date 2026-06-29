import { redirect } from "next/navigation";

/** Legacy URL — UX5 redirect to Set up → Delivery platforms. */
export default function DeliveryPlatformsRedirectPage() {
  redirect("/setup/delivery-platforms");
}
