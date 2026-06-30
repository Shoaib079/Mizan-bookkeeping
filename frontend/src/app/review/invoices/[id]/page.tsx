import { InvoiceDraftReview } from "@/components/invoice-draft-review";

export default async function InvoiceReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvoiceDraftReview draftId={id} />;
}
