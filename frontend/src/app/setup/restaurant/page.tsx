import { redirectLegacySetup } from "@/lib/setup-redirect";

export default function SetupRestaurantRedirect() {
  redirectLegacySetup("/setup/restaurant");
}
