import { redirectLegacySetup } from "@/lib/setup-redirect";

export default function SetupOpeningBalancesRedirect() {
  redirectLegacySetup("/setup/opening-balances");
}
