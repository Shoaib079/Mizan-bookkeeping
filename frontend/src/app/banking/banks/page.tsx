import { BankingBranchListContent } from "@/components/banking/banking-branch-list-content";

export default function BankingBanksPage() {
  return (
    <BankingBranchListContent
      branchKey="banks"
      defaultKind="bank"
      title="Bank accounts"
      emptyHint="No bank accounts yet."
      addLabel="Add bank account"
    />
  );
}
