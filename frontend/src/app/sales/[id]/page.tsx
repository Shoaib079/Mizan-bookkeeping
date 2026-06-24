import { AppShell } from "@/components/layout/app-shell";
import { PosSummaryReview } from "@/components/pos-summary-review";

export default async function SalesReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell title="Review daily sales">
      <PosSummaryReview summaryId={id} />
    </AppShell>
  );
}
