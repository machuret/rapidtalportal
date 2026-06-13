import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { format, subDays } from "date-fns";
import { AdminDailyLogsReview } from "@/components/daily-log/AdminDailyLogsReview";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

export default async function AdminDailyLogsPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;

  if (!["client_admin", "super_admin"].includes(user.role)) redirect("/dashboard");
  if (!user.client_id) redirect("/dashboard");

  // Page back through history in 30-day windows. page 0 = most recent 30 days,
  // page 1 = the 30 before that, etc. — older logs used to be unreachable.
  const page = Math.max(0, Number.parseInt(searchParams?.page ?? "0", 10) || 0);
  const now = new Date();
  const until = format(subDays(now, page * WINDOW_DAYS), "yyyy-MM-dd");
  const since = format(subDays(now, (page + 1) * WINDOW_DAYS - 1), "yyyy-MM-dd");

  const admin = createAdminClient();

  const [{ data: logs }, { data: older }] = await Promise.all([
    admin
      .from("daily_logs")
      .select("*, users!inner(full_name, email, role)")
      .eq("client_id", user.client_id)
      .eq("users.role", "va")
      .gte("log_date", since)
      .lte("log_date", until)
      .order("log_date", { ascending: false })
      .limit(300),
    // Is there anything older than this window? Drives the "Older" control.
    admin
      .from("daily_logs")
      .select("id, users!inner(role)")
      .eq("client_id", user.client_id)
      .eq("users.role", "va")
      .lt("log_date", since)
      .order("log_date", { ascending: false })
      .limit(1),
  ]);

  const hasOlder = (older?.length ?? 0) > 0;
  const rangeLabel = page === 0
    ? "Last 30 days"
    : `${format(new Date(since), "d MMM")} – ${format(new Date(until), "d MMM yyyy")}`;

  const navLink = cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 border-zinc-700");
  const navDisabled = "inline-flex items-center gap-1.5 text-sm text-zinc-600 px-2.5 h-7 rounded-md cursor-not-allowed";

  return (
    <div className="flex flex-col gap-6">
      <AdminDailyLogsReview logs={logs ?? []} rangeLabel={rangeLabel} />

      <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
        {page > 0 ? (
          <Link href={`/admin/daily-logs?page=${page - 1}`} className={navLink}>
            <ChevronLeft className="w-4 h-4" /> Newer
          </Link>
        ) : (
          <span className={navDisabled}><ChevronLeft className="w-4 h-4" /> Newer</span>
        )}

        <span className="text-xs text-zinc-500">{rangeLabel}</span>

        {hasOlder ? (
          <Link href={`/admin/daily-logs?page=${page + 1}`} className={navLink}>
            Older <ChevronRight className="w-4 h-4" />
          </Link>
        ) : (
          <span className={navDisabled}>Older <ChevronRight className="w-4 h-4" /></span>
        )}
      </div>
    </div>
  );
}
