import { BankingBranchListContent } from "@/components/banking/banking-branch-list-content";

export default function BankingCardsPage() {
  return (
    <BankingBranchListContent
      branchKey="credit_cards"
      defaultKind="credit_card"
      title="Credit cards"
      emptyHint="No credit cards yet."
      addLabel="Add credit card"
    />
  );
}
