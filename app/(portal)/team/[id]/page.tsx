import { redirect, notFound } from "next/navigation";
import { getCurrentUserAndClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { format, subDays, parseISO } from "date-fns";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Mail, Phone, CalendarDays, UserCircle, NotebookPen, TrendingUp, Clock, DollarSign, CreditCard, MessageCircle, MapPin, Globe, Wrench } from "lucide-react";
import { VaProfileEditor } from "@/components/team/VaProfileEditor";
import { VaContractEditor, type ContractInit } from "@/components/team/VaContractEditor";
import { ProgressBar } from "@/components/ui/ProgressBar";

function fmtMs(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

const MOOD_META: Record<string, { emoji: string; label: string; color: string; bar: string }> = {
  great:       { emoji: "🟢", label: "Great",       color: "text-green-400",  bar: "bg-green-400"  },
  good:        { emoji: "🔵", label: "Good",        color: "text-blue-400",   bar: "bg-blue-400"   },
  neutral:     { emoji: "🟡", label: "Neutral",     color: "text-yellow-400", bar: "bg-yellow-400" },
  difficult:   { emoji: "🟠", label: "Difficult",   color: "text-orange-400", bar: "bg-orange-400" },
  overwhelmed: { emoji: "🔴", label: "Overwhelmed", color: "text-red-400",    bar: "bg-red-400"    },
};

const MOOD_SCORE: Record<string, number> = {
  great: 5, good: 4, neutral: 3, difficult: 2, overwhelmed: 1,
};

export default async function VaDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getCurrentUserAndClient();
  if (!ctx) redirect("/login");
  const { user } = ctx;

  const isAdmin = user.role === "client_admin" || user.role === "super_admin";
  if (!isAdmin || !user.client_id) redirect("/dashboard");

  const admin = createAdminClient();

  const since30 = format(subDays(new Date(), 29), "yyyy-MM-dd"); // logs window
  const since14 = format(subDays(new Date(), 13), "yyyy-MM-dd"); // time-entries window

  // All keyed by params.id — fetch the VA profile, logs, time and contract in ONE
  // round-trip (was 3 sequential), then verify access. Logs/time/contract for a
  // wrong-tenant id simply return nothing and we notFound() before using them.
  const [{ data: va }, { data: rawLogs }, { data: rawTimeEntries }, { data: contractRow }] = await Promise.all([
    admin
      .from("users")
      .select("id, full_name, email, phone, birthday, avatar_url, created_at, salary, payment_terms, payment_details, whatsapp, personal_email, address, timezone, skills")
      .eq("id", params.id)
      .eq("client_id", user.client_id)
      .eq("role", "va")
      .single(),
    admin
      .from("daily_logs")
      .select("id, log_date, mood, tasks_done, positives, challenges, goals_achieved, goals_tomorrow, admin_feedback, updated_at")
      .eq("user_id", params.id)
      .gte("log_date", since30)
      .order("log_date", { ascending: false }),
    admin
      .from("time_entries")
      .select("id, work_date, phase, started_at, ended_at")
      .eq("user_id", params.id)
      .gte("work_date", since14)
      .order("work_date", { ascending: false }),
    admin
      .from("va_job_contracts")
      .select("rate, currency, pay_period, payment_method, payment_schedule, start_date, weekly_hours, notice_period, next_review_date, annual_leave_days, contract_name")
      .eq("user_id", params.id)
      .maybeSingle(),
  ]);

  if (!va) notFound();

  const logs = rawLogs ?? [];
  const timeEntries = rawTimeEntries ?? [];
  const contract = (contractRow as ContractInit | null) ?? null;

  // Aggregate time per day
  type DaySummary = { work: number; brk: number };
  const timeSummary = timeEntries.reduce<Record<string, DaySummary>>((acc, e) => {
    if (!e.ended_at) return acc;
    const ms = new Date(e.ended_at).getTime() - new Date(e.started_at).getTime();
    if (!acc[e.work_date]) acc[e.work_date] = { work: 0, brk: 0 };
    if (e.phase === "work") acc[e.work_date].work += ms;
    else acc[e.work_date].brk += ms;
    return acc;
  }, {});
  const timeDays = Object.entries(timeSummary).sort(([a], [b]) => b.localeCompare(a));

  // Mood stats
  const moodCounts = logs.reduce<Record<string, number>>((acc, l) => {
    if (l.mood) acc[l.mood] = (acc[l.mood] ?? 0) + 1;
    return acc;
  }, {});
  const avgMoodScore = logs.filter(l => l.mood).length
    ? (logs.filter(l => l.mood).reduce((s, l) => s + (MOOD_SCORE[l.mood!] ?? 0), 0) / logs.filter(l => l.mood).length).toFixed(1)
    : null;

  const initials = (va.full_name ?? va.email)
    .split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase();

  // Cast va to include new fields
  const vaProfile = va as typeof va & {
    salary: number | null;
    payment_terms: string | null;
    payment_details: string | null;
    whatsapp: string | null;
    personal_email: string | null;
    address: string | null;
    timezone: string | null;
    skills: string[] | null;
  };

  return (
    <div>
      {/* Back */}
      <Link
        href="/team"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Team
      </Link>

      {/* VA Profile header */}
      <div className="flex items-start gap-5 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-6 mb-6">
        {va.avatar_url ? (
          <Image
            src={va.avatar_url}
            alt={va.full_name ?? ""}
            width={80}
            height={80}
            className="w-20 h-20 rounded-full object-cover shrink-0 ring-2 ring-zinc-700"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-zinc-700 flex items-center justify-center text-2xl font-bold text-zinc-200 shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-zinc-100">{va.full_name ?? "Unnamed VA"}</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Virtual Assistant</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3">
            <span className="flex items-center gap-1.5 text-sm text-zinc-400">
              <Mail className="w-4 h-4 text-zinc-600" />
              <a href={`mailto:${va.email}`} className="hover:text-blue-400 transition-colors">{va.email}</a>
            </span>
            {vaProfile.personal_email && (
              <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                <Mail className="w-4 h-4 text-zinc-600" />
                <a href={`mailto:${vaProfile.personal_email}`} className="hover:text-blue-400 transition-colors">{vaProfile.personal_email}</a>
                <span className="text-xs text-zinc-600">(personal)</span>
              </span>
            )}
            {va.phone && (
              <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                <Phone className="w-4 h-4 text-zinc-600" />
                <a href={`tel:${va.phone}`} className="hover:text-green-400 transition-colors">{va.phone}</a>
              </span>
            )}
            {vaProfile.whatsapp && (
              <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                <MessageCircle className="w-4 h-4 text-green-600" />
                <a href={`https://wa.me/${vaProfile.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="hover:text-green-400 transition-colors">{vaProfile.whatsapp}</a>
              </span>
            )}
            {va.birthday && (
              <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                <CalendarDays className="w-4 h-4 text-zinc-600" />
                {va.birthday}
              </span>
            )}
            {vaProfile.timezone && (
              <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                <Globe className="w-4 h-4 text-zinc-600" />
                {vaProfile.timezone}
              </span>
            )}
            {vaProfile.address && (
              <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                <MapPin className="w-4 h-4 text-zinc-600" />
                {vaProfile.address}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-sm text-zinc-500">
              <UserCircle className="w-4 h-4 text-zinc-600" />
              Joined {format(parseISO(va.created_at), "d MMM yyyy")}
            </span>
          </div>

          {/* Skills */}
          {vaProfile.skills && vaProfile.skills.length > 0 && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Wrench className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
              {vaProfile.skills.map(s => (
                <span key={s} className="text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded-full">{s}</span>
              ))}
            </div>
          )}

          {/* Admin edit button */}
          <div className="mt-4">
            <VaProfileEditor
              vaId={va.id}
              initial={{
                full_name:       va.full_name,
                phone:           va.phone,
                birthday:        va.birthday,
                salary:          vaProfile.salary,
                payment_terms:   vaProfile.payment_terms,
                payment_details: vaProfile.payment_details,
                whatsapp:        vaProfile.whatsapp,
                personal_email:  vaProfile.personal_email,
                address:         vaProfile.address,
                timezone:        vaProfile.timezone,
                skills:          vaProfile.skills,
              }}
            />
          </div>
        </div>
      </div>

      {/* Job & contract terms — admin only */}
      <div className="mb-6">
        <VaContractEditor vaId={va.id} initial={contract} />
      </div>

      {/* Compensation card — admin only */}
      {(vaProfile.salary || vaProfile.payment_terms || vaProfile.payment_details) && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5 mb-6">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-zinc-500" />
            Compensation & Payment
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {vaProfile.salary != null && (
              <div className="rounded-lg bg-zinc-800/60 border border-zinc-700 px-4 py-3">
                <p className="text-xs text-zinc-500 mb-1">Salary</p>
                <p className="text-lg font-bold text-green-400">${vaProfile.salary.toLocaleString()}</p>
              </div>
            )}
            {vaProfile.payment_terms && (
              <div className="rounded-lg bg-zinc-800/60 border border-zinc-700 px-4 py-3">
                <p className="text-xs text-zinc-500 mb-1 flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> Payment Terms</p>
                <p className="text-sm text-zinc-200">{vaProfile.payment_terms}</p>
              </div>
            )}
            {vaProfile.payment_details && (
              <div className="rounded-lg bg-zinc-800/60 border border-zinc-700 px-4 py-3">
                <p className="text-xs text-zinc-500 mb-1">Payment Details</p>
                <p className="text-sm text-zinc-200 whitespace-pre-wrap">{vaProfile.payment_details}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-center">
          <p className="text-3xl font-bold text-zinc-100">{logs.length}</p>
          <p className="text-xs text-zinc-500 mt-1 flex items-center justify-center gap-1.5">
            <NotebookPen className="w-3.5 h-3.5" />
            Logs (last 30 days)
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-center">
          <p className="text-3xl font-bold text-zinc-100">{avgMoodScore ?? "—"}</p>
          <p className="text-xs text-zinc-500 mt-1 flex items-center justify-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Avg mood score (/ 5)
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-center">
          <p className="text-3xl font-bold text-zinc-100">
            {logs.length > 0 ? Math.round((logs.length / 30) * 100) : 0}%
          </p>
          <p className="text-xs text-zinc-500 mt-1">Submission rate</p>
        </div>
      </div>

      {/* Mood breakdown */}
      {Object.keys(moodCounts).length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5 mb-6">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4">Mood Breakdown — Last 30 Days</h2>
          <div className="flex flex-col gap-2.5">
            {(["great", "good", "neutral", "difficult", "overwhelmed"] as const).map(mood => {
              const count = moodCounts[mood] ?? 0;
              const pct = logs.length ? Math.round((count / logs.length) * 100) : 0;
              const meta = MOOD_META[mood];
              return (
                <div key={mood} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-zinc-400 shrink-0">{meta.emoji} {meta.label}</span>
                  <ProgressBar value={pct} trackClassName="flex-1 h-2" barClassName={meta.bar} />
                  <span className="text-xs text-zinc-500 w-14 text-right shrink-0">{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Time entries */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-500" />
          Work Hours — Last 14 Days
        </h2>
        {timeDays.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-8 text-center">
            <p className="text-zinc-500 text-sm">No time entries recorded yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="grid grid-cols-4 px-5 py-2 border-b border-zinc-800 text-xs font-medium text-zinc-500 uppercase tracking-wider">
              <span>Date</span><span>Work</span><span>Break</span><span>Total tracked</span>
            </div>
            {timeDays.map(([date, s]) => (
              <div key={date} className="grid grid-cols-4 px-5 py-3 border-b border-zinc-800/50 last:border-0 text-sm hover:bg-zinc-800/30 transition-colors">
                <span className="text-zinc-300 font-medium">
                  {format(parseISO(date), "EEE dd MMM")}
                </span>
                <span className="text-green-400 font-mono">{fmtMs(s.work)}</span>
                <span className="text-amber-400 font-mono">{s.brk > 0 ? fmtMs(s.brk) : <span className="text-zinc-700">—</span>}</span>
                <span className="text-zinc-400 font-mono">{fmtMs(s.work + s.brk)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Daily log list */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <NotebookPen className="w-4 h-4 text-zinc-500" />
          Daily Logs — Last 30 Days
        </h2>

        {logs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-10 text-center">
            <p className="text-zinc-400 text-sm">No daily logs submitted in the last 30 days.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {logs.map(log => {
              const mood = log.mood ? MOOD_META[log.mood] : null;
              const hasContent = log.tasks_done || log.positives || log.challenges || log.goals_achieved || log.goals_tomorrow;
              return (
                <details key={log.id} className="group rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                  <summary className="flex items-center gap-4 px-5 py-4 cursor-pointer list-none hover:bg-zinc-800/50 transition-colors">
                    {/* Date */}
                    <div className="shrink-0 w-20">
                      <p className="text-sm font-semibold text-zinc-100">
                        {format(parseISO(log.log_date), "dd MMM")}
                      </p>
                      <p className="text-xs text-zinc-600">
                        {format(parseISO(log.log_date), "EEEE")}
                      </p>
                    </div>

                    {/* Mood badge */}
                    {mood ? (
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 flex items-center gap-1.5 shrink-0 ${mood.color}`}>
                        {mood.emoji} {mood.label}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-600 px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 shrink-0">
                        No mood
                      </span>
                    )}

                    {/* Preview of tasks */}
                    <p className="flex-1 min-w-0 text-xs text-zinc-500 truncate">
                      {log.tasks_done ? log.tasks_done.slice(0, 80) : "No tasks recorded"}
                    </p>

                    {/* Admin feedback indicator */}
                    {log.admin_feedback && (
                      <span className="text-xs text-blue-400 shrink-0">Feedback given</span>
                    )}

                    <span className="text-zinc-600 text-xs shrink-0 group-open:hidden">▶ Expand</span>
                    <span className="text-zinc-600 text-xs shrink-0 hidden group-open:inline">▼ Collapse</span>
                  </summary>

                  {/* Expanded log body */}
                  <div className="border-t border-zinc-800 px-5 py-4 bg-zinc-950/30 grid grid-cols-2 gap-4">
                    {[
                      { label: "✅ Tasks Done",         value: log.tasks_done },
                      { label: "🌟 Positives / Wins",   value: log.positives },
                      { label: "🚧 Challenges",         value: log.challenges },
                      { label: "🎯 Goals Achieved",     value: log.goals_achieved },
                      { label: "📅 Goals for Tomorrow", value: log.goals_tomorrow },
                    ].map(({ label, value }) => value ? (
                      <div key={label} className="flex flex-col gap-1">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{label}</p>
                        <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{value}</p>
                      </div>
                    ) : null)}

                    {log.admin_feedback && (
                      <div className="col-span-2 mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                        <p className="text-xs font-semibold text-blue-400 mb-1">💬 Admin Feedback</p>
                        <p className="text-sm text-zinc-300">{log.admin_feedback}</p>
                      </div>
                    )}

                    {!hasContent && (
                      <p className="col-span-2 text-sm text-zinc-500 italic">No content entered for this day.</p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
