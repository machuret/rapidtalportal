import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MyJobHub, type Contract, type DayRow, type LeaveRow, type IssueRow, type ReportRow, type TeamLeaveRow } from "@/components/my-job/MyJobHub";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Job — RapidTal" };

export default async function MyJobPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  // "My Job" is the working team's own employment hub.
  if (!["va", "client_admin"].includes(user.role)) redirect("/dashboard");

  const admin = createAdminClient();
  const [{ data: contract }, { data: days }, { data: leave }, { data: issues }, { data: reports }] = await Promise.all([
    admin.from("va_job_contracts").select("*").eq("user_id", user.id).maybeSingle(),
    admin.from("va_days_worked").select("id, work_date, hours, note").eq("user_id", user.id).order("work_date", { ascending: false }).limit(400),
    admin.from("va_leave_requests").select("id, start_date, end_date, leave_type, reason, status").eq("user_id", user.id).order("start_date", { ascending: false }),
    admin.from("va_issues").select("id, category, subject, detail, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("va_self_reports").select("id, report_month, delivered, challenges, goals").eq("user_id", user.id).order("report_month", { ascending: false }),
  ]);

  // Client admins also manage their team's leave requests in a dedicated tab.
  const isAdmin = user.role === "client_admin" && !!user.client_id;
  let teamLeave: TeamLeaveRow[] = [];
  if (isAdmin && user.client_id) {
    const [{ data: rows }, { data: members }] = await Promise.all([
      admin.from("va_leave_requests").select("id, user_id, start_date, end_date, leave_type, reason, status")
        .eq("client_id", user.client_id).order("start_date", { ascending: false }).limit(200),
      admin.from("users").select("id, full_name, email").eq("client_id", user.client_id),
    ]);
    const name = new Map(((members ?? []) as { id: string; full_name: string | null; email: string }[]).map((m) => [m.id, m.full_name ?? m.email]));
    teamLeave = ((rows ?? []) as Omit<TeamLeaveRow, "userName">[]).map((r) => ({ ...r, userName: name.get(r.user_id) ?? "Unknown" }));
  }

  return (
    <div className="max-w-5xl">
      <MyJobHub
        vaTimezone={user.timezone ?? null}
        contract={(contract as Contract | null) ?? null}
        initialDays={(days ?? []) as DayRow[]}
        initialLeave={(leave ?? []) as LeaveRow[]}
        initialIssues={(issues ?? []) as IssueRow[]}
        initialReports={(reports ?? []) as ReportRow[]}
        isAdmin={isAdmin}
        initialTeamLeave={teamLeave}
      />
    </div>
  );
}
