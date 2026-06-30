import { redirectLegacySetup } from "@/lib/setup-redirect";

export default function ManualJournalsLegacyRedirect() {
  redirectLegacySetup("/accounting/manual-journals");
}
