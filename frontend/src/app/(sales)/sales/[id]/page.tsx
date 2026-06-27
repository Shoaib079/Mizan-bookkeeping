import { PosSummaryReview } from "@/components/pos-summary-review";

export default async function SalesReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <PosSummaryReview summaryId={id} />
    </>
  );
}
