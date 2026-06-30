import { redirectLegacySetup } from "@/lib/setup-redirect";

export default function SettingsExpenseItemsRedirect() {
  redirectLegacySetup("/settings/expense-items");
}
