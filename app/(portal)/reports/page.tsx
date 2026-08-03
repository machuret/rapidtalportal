import { requireClientAdmin } from "@/lib/auth";
import { ClientReport } from "@/components/reports/ClientReport";
import { buildClientReport, recentMonths } from "./report-data";
import { withPortalDataTimeout } from "@/lib/server-data-timeout";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monthly Report — RapidTal" };

export default async function ReportsPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ month?: string }> }) {
  const searchParams = await searchParamsPromise;
  const { user, client } = await requireClientAdmin();

  const months = recentMonths(6);
  const monthKey = months.some((m) => m.key === searchParams.month) ? searchParams.month! : months[0].key;
  const data = await withPortalDataTimeout(
    buildClientReport(user.client_id, client?.name ?? "", monthKey),
    "Monthly report",
  );

  return <ClientReport data={data} />;
}
