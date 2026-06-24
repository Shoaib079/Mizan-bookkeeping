import { AppShell } from "@/components/layout/app-shell";
import { DeliveryReportReview } from "@/components/delivery-report-review";

export default async function DeliveryReportReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell title="Review delivery report">
      <DeliveryReportReview reportId={id} />
    </AppShell>
  );
}
