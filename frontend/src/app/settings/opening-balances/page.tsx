import { redirectLegacySetup } from "@/lib/setup-redirect";

export default function SettingsOpeningBalancesRedirect() {
  redirectLegacySetup("/settings/opening-balances");
}
