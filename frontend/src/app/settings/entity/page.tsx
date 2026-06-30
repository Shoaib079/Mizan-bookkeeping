import { redirectLegacySetup } from "@/lib/setup-redirect";

export default function SettingsEntityRedirect() {
  redirectLegacySetup("/settings/entity");
}
