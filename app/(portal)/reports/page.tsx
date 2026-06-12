import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { ClientReport } from "@/components/reports/ClientReport";
import { buildClientReport, recentMonths } from "./report-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monthly Report — RapidTal" };

export default async function ReportsPage({ searchParams }: { searchParams: { month?: string } }) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user, client } = ctx;
  if (user.role !== "client_admin" || !user.client_id) redirect("/dashboard");

  const months = recentMonths(6);
  const monthKey = months.some((m) => m.key === searchParams.month) ? searchParams.month! : months[0].key;
  const data = await buildClientReport(user.client_id, client?.name ?? "", monthKey);

  return <ClientReport data={data} />;
}
