import { redirectLegacySetup } from "@/lib/setup-redirect";

export default function SetupDeliveryPlatformsRedirect() {
  redirectLegacySetup("/setup/delivery-platforms");
}
