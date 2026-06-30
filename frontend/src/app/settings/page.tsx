import { redirectLegacySetup } from "@/lib/setup-redirect";

export default function SettingsIndexRedirect() {
  redirectLegacySetup("/settings");
}
