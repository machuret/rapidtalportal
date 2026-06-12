import { redirect } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MyJobHub, type Contract, type DayRow, type LeaveRow, type IssueRow, type ReportRow } from "@/components/my-job/MyJobHub";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Job — RapidTal" };

export default async function MyJobPage() {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;
  // "My Job" is the VA's own employment hub. Clients don't have a "job" here —
  // their only need (approving VA leave) now lives on the Team page.
  if (user.role === "client_admin") redirect("/team");
  if (user.role !== "va") redirect("/dashboard");

  const admin = createAdminClient();
  const [{ data: contract }, { data: days }, { data: leave }, { data: issues }, { data: reports }] = await Promise.all([
    admin.from("va_job_contracts").select("*").eq("user_id", user.id).maybeSingle(),
    admin.from("va_days_worked").select("id, work_date, hours, note").eq("user_id", user.id).order("work_date", { ascending: false }).limit(400),
    admin.from("va_leave_requests").select("id, start_date, end_date, leave_type, reason, status").eq("user_id", user.id).order("start_date", { ascending: false }),
    admin.from("va_issues").select("id, category, subject, detail, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("va_self_reports").select("id, report_month, delivered, challenges, goals").eq("user_id", user.id).order("report_month", { ascending: false }),
  ]);

  // Client-admin leave approvals moved to the Team page; this hub is VA-only now.
  return (
    <div className="max-w-5xl">
      <MyJobHub
        vaTimezone={user.timezone ?? null}
        contract={(contract as Contract | null) ?? null}
        initialDays={(days ?? []) as DayRow[]}
        initialLeave={(leave ?? []) as LeaveRow[]}
        initialIssues={(issues ?? []) as IssueRow[]}
        initialReports={(reports ?? []) as ReportRow[]}
        isAdmin={false}
        initialTeamLeave={[]}
      />
    </div>
  );
}
