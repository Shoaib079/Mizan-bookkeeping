import { redirectLegacySetup } from "@/lib/setup-redirect";

export default function SetupMembersRedirect() {
  redirectLegacySetup("/setup/members");
}
