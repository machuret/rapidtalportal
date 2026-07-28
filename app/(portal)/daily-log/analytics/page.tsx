import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { format, subDays } from "date-fns";
import { DailyLogAnalyticsLazy } from "@/components/daily-log/DailyLogAnalyticsLazy";
import type { AnalyticsEntry } from "@/types/daily-log";

export const dynamic = "force-dynamic";

export default async function DailyLogAnalyticsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;

  const since90 = format(subDays(new Date(), 89), "yyyy-MM-dd");
  const admin = createAdminClient();
  const isAdmin = user.role === "client_admin" || user.role === "super_admin";

  let entries: AnalyticsEntry[] = [];
  let displayName = user.full_name ?? user.email;

  if (isAdmin && user.client_id) {
    // Admin: show a specific VA's analytics if ?employee= is set,
    // otherwise show aggregated entries for all VAs in the client.
    const targetId = searchParams.employee;

    if (targetId) {
      // Fetch the VA's name for the heading
      const { data: vaUser } = await admin
        .from("users")
        .select("full_name, email")
        .eq("id", targetId)
        .eq("client_id", user.client_id)
        .maybeSingle();
      displayName = vaUser
        ? ((vaUser as { full_name: string | null; email: string }).full_name ??
          (vaUser as { full_name: string | null; email: string }).email)
        : "VA";

      const { data } = await admin
        .from("daily_logs")
        .select("log_date, mood, tasks_done, goals_achieved, challenges")
        .eq("user_id", targetId)
        .eq("client_id", user.client_id)
        .gte("log_date", since90)
        .order("log_date", { ascending: true });
      entries = (data ?? []) as AnalyticsEntry[];
    } else {
      // All VAs aggregated
      displayName = "All Team Members";
      const { data } = await admin
        .from("daily_logs")
        .select("log_date, mood, tasks_done, goals_achieved, challenges, users!inner(role)")
        .eq("client_id", user.client_id)
        .eq("users.role", "va")
        .gte("log_date", since90)
        .order("log_date", { ascending: true })
        .limit(500);
      entries = (data ?? []) as AnalyticsEntry[];
    }
  } else {
    // VA: see only their own analytics
    const { data } = await admin
      .from("daily_logs")
      .select("log_date, mood, tasks_done, goals_achieved, challenges")
      .eq("user_id", user.id)
      .gte("log_date", since90)
      .order("log_date", { ascending: true });
    entries = (data ?? []) as AnalyticsEntry[];
  }

  return <DailyLogAnalyticsLazy entries={entries} userName={displayName} />;
}
