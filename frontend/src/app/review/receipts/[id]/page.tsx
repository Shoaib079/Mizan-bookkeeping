import { ReceiptReview } from "@/components/receipt-review";

export default async function ReceiptReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReceiptReview intakeId={id} />;
}
