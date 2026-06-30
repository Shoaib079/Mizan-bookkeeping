import { redirectLegacySetup } from "@/lib/setup-redirect";

export default function SetupAccountsRedirect() {
  redirectLegacySetup("/setup/accounts");
}
