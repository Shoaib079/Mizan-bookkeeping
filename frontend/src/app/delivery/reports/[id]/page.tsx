import { redirect } from "next/navigation";

/** Legacy drill-down — open inline on the reports hub. */
export default async function DeliveryReportRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/delivery/reports?report=${id}`);
}
