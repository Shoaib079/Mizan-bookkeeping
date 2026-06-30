import { redirectLegacySetup } from "@/lib/setup-redirect";

export default function SettingsMembersRedirect() {
  redirectLegacySetup("/settings/members");
}
