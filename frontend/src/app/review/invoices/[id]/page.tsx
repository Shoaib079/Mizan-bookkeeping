import { AppShell } from "@/components/layout/app-shell";
import { InvoiceDraftReview } from "@/components/invoice-draft-review";

export default async function InvoiceReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell title="Review supplier invoice">
      <InvoiceDraftReview draftId={id} />
    </AppShell>
  );
}
