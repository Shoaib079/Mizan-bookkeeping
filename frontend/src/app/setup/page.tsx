import { redirectLegacySetup } from "@/lib/setup-redirect";

export default function SetupIndexRedirect() {
  redirectLegacySetup("/setup");
}
