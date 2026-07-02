import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Legacy URL — redirect to Reports → General ledger. */
export default async function ReviewPostedRedirectPage({ searchParams }: Props) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value) && value[0]) qs.set(key, value[0]);
  }
  const query = qs.toString();
  redirect(query ? `/reports/ledger?${query}` : "/reports/ledger");
}
