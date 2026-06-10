import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { format, subDays } from "date-fns";
import { DailyLogStudio } from "@/components/daily-log/DailyLogStudio";
import { ClientAdminLogViewer } from "@/components/daily-log/ClientAdminLogViewer";
import { PageIntro } from "@/components/layout/PageIntro";
import type { DailyLog, DailyLogNote, Mood } from "@/types/daily-log";

export const dynamic = "force-dynamic";

export const metadata = { title: "Daily Log — RapidTal" };

export default async function DailyLogPage({
  searchParams,
}: {
  searchParams: { employee?: string };
}) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;

  const admin = createAdminClient();
  const isClientAdmin = user.role === "client_admin" || user.role === "super_admin";

  // ── Client admin: show employee picker + selected employee's log ──
  if (isClientAdmin && user.client_id) {
    const { data: employees } = await admin
      .from("users")
      .select("id, full_name, email")
      .eq("client_id", user.client_id)
      .eq("role", "va")
      .order("full_name");

    const vaUsers = (employees ?? []) as { id: string; full_name: string | null; email: string }[];

    // Which employee to view — defaults to first VA
    const selectedId = searchParams.employee ?? vaUsers[0]?.id ?? null;

    let selectedLog: DailyLog | null = null;
    let selectedNotes: DailyLogNote[] = [];
    let selectedHistory: { log_date: string; mood: Mood | null }[] = [];

    if (selectedId) {
      const today = format(new Date(), "yyyy-MM-dd");
      const since = format(subDays(new Date(), 29), "yyyy-MM-dd");

      const [logRes, histRes] = await Promise.all([
        admin.from("daily_logs").select("*").eq("user_id", selectedId).eq("log_date", today).maybeSingle(),
        admin.from("daily_logs").select("log_date, mood").eq("user_id", selectedId).gte("log_date", since).order("log_date", { ascending: true }),
      ]);

      selectedLog = logRes.data as DailyLog | null;
      selectedHistory = (histRes.data ?? []) as { log_date: string; mood: Mood | null }[];

      if (selectedLog?.id) {
        const { data: notes } = await admin
          .from("daily_log_notes").select("*").eq("log_id", selectedLog.id).order("created_at", { ascending: false });
        selectedNotes = notes ?? [];
      }
    }

    return (
      <ClientAdminLogViewer
        employees={vaUsers}
        selectedEmployeeId={selectedId}
        initialLog={selectedLog}
        initialNotes={selectedNotes}
        initialHistory={selectedHistory}
      />
    );
  }

  // ── VA: see their own log ──
  const today = format(new Date(), "yyyy-MM-dd");
  const since = format(subDays(new Date(), 29), "yyyy-MM-dd");

  const [todayResult, historyResult] = await Promise.all([
    admin.from("daily_logs").select("*").eq("user_id", user.id).eq("log_date", today).maybeSingle(),
    admin.from("daily_logs").select("log_date, mood").eq("user_id", user.id).gte("log_date", since).order("log_date", { ascending: true }),
  ]);

  const todayLog = todayResult.data as DailyLog | null;
  let todayNotes: DailyLogNote[] = [];
  if (todayLog?.id) {
    const { data } = await admin
      .from("daily_log_notes").select("*").eq("log_id", todayLog.id).order("created_at", { ascending: false });
    todayNotes = data ?? [];
  }

  const history = (historyResult.data ?? []) as { log_date: string; mood: Mood | null }[];

  return (
    <div>
      <PageIntro id="daily-log" />
      <DailyLogStudio
        initialLog={todayLog}
        initialNotes={todayNotes}
        initialHistory={history}
      />
    </div>
  );
}
