import { InvoiceDraftReview } from "@/components/invoice-draft-review";
import { PageHeader } from "@/components/page/page-header";

export default async function InvoiceReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <PageHeader title="Invoice" />
      <InvoiceDraftReview draftId={id} />
    </>
  );
}
