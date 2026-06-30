import { redirectLegacySetup } from "@/lib/setup-redirect";

export default function SetupAccountantRedirect() {
  redirectLegacySetup("/setup/accountant");
}
