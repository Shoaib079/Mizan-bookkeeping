import { redirectLegacySetup } from "@/lib/setup-redirect";

export default function SetupExpenseItemsRedirect() {
  redirectLegacySetup("/setup/expense-items");
}
