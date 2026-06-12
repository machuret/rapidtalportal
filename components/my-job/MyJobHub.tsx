"use client";

/**
 * "My Job" — the VA's employment hub. Tabs: Overview (key terms, tenure, rate
 * review, timezone overlap), Days Worked, Leave, Holidays, Self-Reports, Issues.
 * Contract terms are read-only here (admins set them); everything else the VA
 * authors. Document generators (invoice / COE / tax) land in a later pass.
 */
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { differenceInCalendarMonths, addMonths, format } from "date-fns";
import {
  Briefcase, CalendarDays, Plane, FileText, AlertTriangle, Clock,
  Loader2, Plus, Trash2, DollarSign, CalendarClock, Users, Check, X,
} from "lucide-react";
import { TimezoneOverlap } from "./TimezoneOverlap";
import { HolidayCalendars } from "./HolidayCalendars";

// ── Types (mirror the DB rows) ───────────────────────────────────────────────
export interface Contract {
  rate: number | null; currency: string; pay_period: string;
  payment_method: string | null; payment_schedule: string | null;
  start_date: string | null; weekly_hours: number | null;
  notice_period: string | null; next_review_date: string | null;
  contract_path: string | null; contract_name: string | null;
}
export interface DayRow { id: string; work_date: string; hours: number | null; note: string | null }
export interface LeaveRow { id: string; start_date: string; end_date: string; leave_type: string; reason: string | null; status: string }
export interface IssueRow { id: string; category: string; subject: string; detail: string; status: string; created_at: string }
export interface ReportRow { id: string; report_month: string; delivered: string | null; challenges: string | null; goals: string | null }
export interface TeamLeaveRow { id: string; user_id: string; userName: string; start_date: string; end_date: string; leave_type: string; reason: string | null; status: string }

interface Props {
  vaTimezone: string | null;
  contract: Contract | null;
  initialDays: DayRow[];
  initialLeave: LeaveRow[];
  initialIssues: IssueRow[];
  initialReports: ReportRow[];
  isAdmin?: boolean;
  initialTeamLeave?: TeamLeaveRow[];
}

type Tab = "overview" | "days" | "leave" | "holidays" | "documents" | "reports" | "issues" | "team-leave";
const TABS: { id: Tab; label: string; icon: typeof Briefcase; admin?: boolean }[] = [
  { id: "overview", label: "Overview", icon: Briefcase },
  { id: "days", label: "Days Worked", icon: CalendarDays },
  { id: "leave", label: "Leave", icon: Plane },
  { id: "team-leave", label: "Team Leave", icon: Users, admin: true },
  { id: "holidays", label: "Holidays", icon: CalendarDays },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "reports", label: "Self-Reports", icon: FileText },
  { id: "issues", label: "Raise an Issue", icon: AlertTriangle },
];

const money = (n: number | null, ccy: string) => {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: (ccy || "USD").toUpperCase(), maximumFractionDigits: 2 }).format(n);
  } catch {
    // Free-text / non-ISO currency code — never let it crash the Overview.
    return `${ccy} ${n.toFixed(2)}`;
  }
};
const niceDate = (iso: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

export function MyJobHub({ vaTimezone, contract, initialDays, initialLeave, initialIssues, initialReports, isAdmin = false, initialTeamLeave = [] }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const tabs = TABS.filter((t) => !t.admin || isAdmin);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Briefcase className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">My Job</h1>
          <p className="text-zinc-400 text-sm mt-1">Your contract, pay, days worked, leave and the records you may need.</p>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-zinc-800 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("inline-flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors",
              tab === t.id ? "border-emerald-500 text-white font-medium" : "border-transparent text-zinc-400 hover:text-zinc-200")}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview contract={contract} vaTimezone={vaTimezone} />}
      {tab === "days" && <DaysTab initial={initialDays} />}
      {tab === "leave" && <LeaveTab initial={initialLeave} />}
      {tab === "team-leave" && isAdmin && <TeamLeaveTab initial={initialTeamLeave} />}
      {tab === "holidays" && <HolidayCalendars />}
      {tab === "documents" && <DocumentsTab />}
      {tab === "reports" && <ReportsTab initial={initialReports} />}
      {tab === "issues" && <IssuesTab initial={initialIssues} />}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────
function Overview({ contract, vaTimezone }: { contract: Contract | null; vaTimezone: string | null }) {
  const start = contract?.start_date ? new Date(contract.start_date + "T00:00:00") : null;
  const months = start ? differenceInCalendarMonths(new Date(), start) : null;
  const tenure = months == null ? null : { y: Math.floor(months / 12), m: months % 12 };
  const nextAnniv = start ? addMonths(start, ((Math.floor((months ?? 0) / 12)) + 1) * 12) : null;

  // Rate review nudge: due if next_review_date is set and within 30 days/past,
  // or (fallback) at the 6-month mark and every anniversary (12, 24, 36…) when
  // no review date is set.
  const reviewDate = contract?.next_review_date ? new Date(contract.next_review_date + "T00:00:00") : null;
  const daysToReview = reviewDate ? Math.round((reviewDate.getTime() - Date.now()) / 86_400_000) : null;
  const reviewDue = daysToReview != null && daysToReview <= 30;
  const milestoneDue = !reviewDate && months != null && (months === 6 || (months >= 12 && months % 12 === 0));

  const terms: { icon: typeof DollarSign; label: string; value: string }[] = [
    { icon: DollarSign, label: "Rate", value: `${money(contract?.rate ?? null, contract?.currency ?? "USD")} / ${contract?.pay_period ?? "—"}` },
    { icon: Clock, label: "Hours", value: contract?.weekly_hours ? `${contract.weekly_hours} hrs / week` : "—" },
    { icon: CalendarDays, label: "Start date", value: niceDate(contract?.start_date ?? null) },
    { icon: CalendarClock, label: "Notice period", value: contract?.notice_period || "—" },
    { icon: CalendarClock, label: "Next review", value: niceDate(contract?.next_review_date ?? null) },
    { icon: DollarSign, label: "Payment method", value: contract?.payment_method || "—" },
    { icon: CalendarClock, label: "Payment schedule", value: contract?.payment_schedule || "—" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {(reviewDue || milestoneDue) && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <CalendarClock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200">
            {reviewDue
              ? `A rate review is due ${daysToReview != null && daysToReview < 0 ? "(overdue)" : `in ${daysToReview} days`}. Worth raising the conversation.`
              : `You've hit your ${months}-month mark — a good time for a rate review conversation.`}
          </p>
        </div>
      )}

      {!contract && (
        <div className="surface-card p-5 text-sm text-zinc-400">
          Your contract terms haven&apos;t been set yet. Your client admin or RapidTal will fill these in.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Key terms */}
        <div className="surface-card p-5">
          <h3 className="font-semibold text-zinc-100 mb-4">Contract key terms</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            {terms.map((t) => (
              <div key={t.label} className="flex items-start gap-2.5">
                <t.icon className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{t.label}</dt>
                  <dd className="text-sm text-zinc-100 break-words">{t.value}</dd>
                </div>
              </div>
            ))}
          </dl>
          {contract?.contract_path && <ContractDownload name={contract.contract_name} />}
        </div>

        {/* Tenure */}
        <div className="surface-card p-5 flex flex-col">
          <h3 className="font-semibold text-zinc-100 mb-4">Tenure</h3>
          {tenure ? (
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-4xl font-bold text-white">
                {tenure.y > 0 && <>{tenure.y}<span className="text-lg text-zinc-400 font-medium">y </span></>}
                {tenure.m}<span className="text-lg text-zinc-400 font-medium">mo</span>
              </p>
              <p className="text-sm text-zinc-500 mt-1">Since {niceDate(contract?.start_date ?? null)}</p>
              {nextAnniv && (
                <p className="text-xs text-zinc-500 mt-3">
                  Next anniversary: <span className="text-zinc-300">{format(nextAnniv, "d MMM yyyy")}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Start date not set yet.</p>
          )}
        </div>
      </div>

      <TimezoneOverlap defaultVaZone={vaTimezone} />
    </div>
  );
}

/** VA-facing "download my signed contract" — fetches a short-lived signed URL. */
function ContractDownload({ name }: { name: string | null }) {
  const [loading, setLoading] = useState(false);
  async function open() {
    if (loading) return;
    setLoading(true);
    try {
      const { url } = await api.get<{ url: string }>(ROUTES.myJob.contractDocument(), { showErrorToast: false });
      window.open(url, "_blank");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't open the contract."); }
    finally { setLoading(false); }
  }
  return (
    <button onClick={open} disabled={loading}
      className="mt-4 inline-flex items-center gap-2 text-sm rounded-lg border border-zinc-700 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 px-3 py-1.5 transition-colors disabled:opacity-50">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4 text-emerald-400" />}
      {name || "Signed contract"} <span className="text-zinc-500">— download</span>
    </button>
  );
}

// ── Days Worked ──────────────────────────────────────────────────────────────
function monthKey(iso: string) { return iso.slice(0, 7); }
function monthLabel(key: string) { return new Date(key + "-01T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" }); }

function DaysTab({ initial }: { initial: DayRow[] }) {
  const [days, setDays] = useState<DayRow[]>(initial);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("8");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (saving || !date) return;
    setSaving(true);
    try {
      const { day } = await api.post<{ day: DayRow }>(ROUTES.myJob.days(), {
        work_date: date, hours: hours ? Number(hours) : null, note: note.trim() || null,
      }, { showErrorToast: false });
      setDays((prev) => [day, ...prev.filter((d) => d.work_date !== day.work_date)].sort((a, b) => b.work_date.localeCompare(a.work_date)));
      setNote("");
      toast.success("Day logged.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't log the day."); }
    finally { setSaving(false); }
  }

  async function remove(d: DayRow) {
    setDays((prev) => prev.filter((x) => x.id !== d.id));
    try { await api.delete(`${ROUTES.myJob.days()}?date=${d.work_date}`, undefined, { showErrorToast: false }); }
    catch { toast.error("Couldn't remove it."); setDays((prev) => [...prev, d].sort((a, b) => b.work_date.localeCompare(a.work_date))); }
  }

  // Group into monthly summaries.
  const groups = Array.from(days.reduce((m, d) => {
    const k = monthKey(d.work_date); if (!m.has(k)) m.set(k, []); m.get(k)!.push(d); return m;
  }, new Map<string, DayRow[]>()).entries());

  return (
    <div className="flex flex-col gap-5">
      <div className="surface-card p-5">
        <h3 className="font-semibold text-zinc-100 mb-4">Log a working day</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5" />
          </div>
          <div className="flex flex-col gap-1 w-24">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">Hours</label>
            <input type="number" min="0" max="24" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you worked on…"
              className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5" />
          </div>
          <Button onClick={add} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Log day
          </Button>
        </div>
      </div>

      {groups.length === 0 && <p className="text-sm text-zinc-500">No days logged yet.</p>}
      {groups.map(([key, rows]) => {
        const totalH = rows.reduce((s, r) => s + (r.hours ?? 0), 0);
        return (
          <div key={key} className="surface-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/60">
              <p className="font-semibold text-zinc-100 text-sm">{monthLabel(key)}</p>
              <p className="text-xs text-zinc-400">{rows.length} days · {totalH} hrs</p>
            </div>
            <div className="divide-y divide-zinc-800/70">
              {rows.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-sm text-zinc-300 tabular-nums w-28 shrink-0">{new Date(d.work_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
                  <span className="text-sm text-zinc-400 w-16 shrink-0">{d.hours ?? "—"} h</span>
                  <span className="text-sm text-zinc-500 truncate flex-1">{d.note}</span>
                  <button onClick={() => remove(d)} className="text-zinc-600 hover:text-red-400 transition-colors shrink-0"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Leave ────────────────────────────────────────────────────────────────────
const LEAVE_TINT: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300", approved: "bg-green-500/15 text-green-300", declined: "bg-red-500/15 text-red-300",
};
function LeaveTab({ initial }: { initial: LeaveRow[] }) {
  const [rows, setRows] = useState<LeaveRow[]>(initial);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [type, setType] = useState("annual");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function request() {
    if (saving || !start || !end) return;
    setSaving(true);
    try {
      const { request: r } = await api.post<{ request: LeaveRow }>(ROUTES.myJob.leave(), {
        start_date: start, end_date: end, leave_type: type, reason: reason.trim() || null,
      }, { showErrorToast: false });
      setRows((prev) => [r, ...prev]);
      setStart(""); setEnd(""); setReason("");
      toast.success("Leave requested — your client has been notified.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't submit the request."); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="surface-card p-5">
        <h3 className="font-semibold text-zinc-100 mb-4">Request leave</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">From</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">To</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5">
              <option value="annual">Annual</option><option value="sick">Sick</option><option value="personal">Personal</option><option value="unpaid">Unpaid</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">Reason (optional)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5" />
          </div>
          <Button onClick={request} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plane className="w-4 h-4" />} Request
          </Button>
        </div>
      </div>

      {rows.length === 0 ? <p className="text-sm text-zinc-500">No leave requests yet.</p> : (
        <div className="surface-card divide-y divide-zinc-800/70 overflow-hidden">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-100">{niceDate(r.start_date)} → {niceDate(r.end_date)}</p>
                <p className="text-xs text-zinc-500 capitalize">{r.leave_type}{r.reason ? ` · ${r.reason}` : ""}</p>
              </div>
              <span className={cn("text-[11px] font-semibold rounded-full px-2.5 py-0.5 capitalize", LEAVE_TINT[r.status] ?? "bg-zinc-700 text-zinc-300")}>{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Team Leave (client_admin) ────────────────────────────────────────────────
function TeamLeaveTab({ initial }: { initial: TeamLeaveRow[] }) {
  const [rows, setRows] = useState<TeamLeaveRow[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(row: TeamLeaveRow, status: "approved" | "declined") {
    if (busy) return;
    setBusy(row.id);
    try {
      await api.patch(ROUTES.myJob.leave(), { id: row.id, status }, { showErrorToast: false });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
      toast.success(`Leave ${status}.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update."); }
    finally { setBusy(null); }
  }

  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");

  function Row({ r }: { r: TeamLeaveRow }) {
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-zinc-100">{r.userName} · {niceDate(r.start_date)} → {niceDate(r.end_date)}</p>
          <p className="text-xs text-zinc-500 capitalize">{r.leave_type}{r.reason ? ` · ${r.reason}` : ""}</p>
        </div>
        {r.status === "pending" ? (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => decide(r, "approved")} disabled={busy === r.id}
              className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-green-500/15 text-green-300 hover:bg-green-500/25 px-2.5 py-1 transition-colors disabled:opacity-50">
              {busy === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
            </button>
            <button onClick={() => decide(r, "declined")} disabled={busy === r.id}
              className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 px-2.5 py-1 transition-colors disabled:opacity-50">
              <X className="w-3.5 h-3.5" /> Decline
            </button>
          </div>
        ) : (
          <span className={cn("text-[11px] font-semibold rounded-full px-2.5 py-0.5 capitalize shrink-0", LEAVE_TINT[r.status] ?? "bg-zinc-700 text-zinc-300")}>{r.status}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="font-semibold text-zinc-100 mb-3">Pending requests {pending.length > 0 && <span className="text-amber-400">({pending.length})</span>}</h3>
        {pending.length === 0 ? <p className="text-sm text-zinc-500">No pending leave requests.</p> : (
          <div className="surface-card divide-y divide-zinc-800/70 overflow-hidden">{pending.map((r) => <Row key={r.id} r={r} />)}</div>
        )}
      </div>
      {decided.length > 0 && (
        <div>
          <h3 className="font-semibold text-zinc-100 mb-3">Reviewed</h3>
          <div className="surface-card divide-y divide-zinc-800/70 overflow-hidden">{decided.map((r) => <Row key={r.id} r={r} />)}</div>
        </div>
      )}
    </div>
  );
}

// ── Documents ────────────────────────────────────────────────────────────────
function DocumentsTab() {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defMonth = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
  const [invMonth, setInvMonth] = useState(defMonth);
  const [taxYear, setTaxYear] = useState(String(now.getFullYear()));
  const [withIncome, setWithIncome] = useState(true);
  const years = Array.from({ length: 4 }, (_, i) => String(now.getFullYear() - i));

  const card = "surface-card p-5 flex flex-col gap-3";
  const open = (href: string) => window.open(href, "_blank");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className={card}>
        <div>
          <h3 className="font-semibold text-zinc-100">Invoice</h3>
          <p className="text-xs text-zinc-500 mt-1">Auto-built from your logged days and contract rate, with the monthly days summary attached. Print or save as PDF.</p>
        </div>
        <div className="flex items-center gap-2 mt-auto">
          <input type="month" value={invMonth} onChange={(e) => setInvMonth(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5 flex-1" />
          <Button onClick={() => open(`/my-job/documents/invoice?month=${invMonth}`)} className="gap-2 shrink-0">
            <FileText className="w-4 h-4" /> Generate
          </Button>
        </div>
      </div>

      <div className={card}>
        <div>
          <h3 className="font-semibold text-zinc-100">Certificate of Employment</h3>
          <p className="text-xs text-zinc-500 mt-1">Proof of engagement (and optionally income) from your contract and tenure — for loans, credit cards, visas, renting.</p>
        </div>
        <div className="flex items-center gap-2 mt-auto">
          <label className="flex items-center gap-2 text-xs text-zinc-400 flex-1 cursor-pointer">
            <input type="checkbox" checked={withIncome} onChange={(e) => setWithIncome(e.target.checked)} className="accent-emerald-500" />
            Include income details
          </label>
          <Button onClick={() => open(`/my-job/documents/certificate${withIncome ? "?income=1" : ""}`)} className="gap-2 shrink-0">
            <FileText className="w-4 h-4" /> Generate
          </Button>
        </div>
      </div>

      <div className={card}>
        <div>
          <h3 className="font-semibold text-zinc-100">Yearly income summary</h3>
          <p className="text-xs text-zinc-500 mt-1">Month-by-month income compiled from your logged days, for your BIR / tax filing.</p>
        </div>
        <div className="flex items-center gap-2 mt-auto">
          <select value={taxYear} onChange={(e) => setTaxYear(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5 flex-1">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <Button onClick={() => open(`/my-job/documents/tax?year=${taxYear}`)} className="gap-2 shrink-0">
            <FileText className="w-4 h-4" /> Generate
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Self-Reports ─────────────────────────────────────────────────────────────
function ReportsTab({ initial }: { initial: ReportRow[] }) {
  const [rows, setRows] = useState<ReportRow[]>(initial);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [delivered, setDelivered] = useState("");
  const [challenges, setChallenges] = useState("");
  const [goals, setGoals] = useState("");
  const [saving, setSaving] = useState(false);

  function loadMonth(m: string) {
    setMonth(m);
    const existing = rows.find((r) => r.report_month.slice(0, 7) === m);
    setDelivered(existing?.delivered ?? "");
    setChallenges(existing?.challenges ?? "");
    setGoals(existing?.goals ?? "");
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const { report } = await api.put<{ report: ReportRow }>(ROUTES.myJob.selfReport(), {
        report_month: `${month}-01`, delivered: delivered.trim() || null, challenges: challenges.trim() || null, goals: goals.trim() || null,
      }, { showErrorToast: false });
      setRows((prev) => [report, ...prev.filter((r) => r.report_month !== report.report_month)].sort((a, b) => b.report_month.localeCompare(a.report_month)));
      toast.success("Self-report saved.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the report."); }
    finally { setSaving(false); }
  }

  const field = "w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 resize-y";
  return (
    <div className="flex flex-col gap-5">
      <div className="surface-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-zinc-100">Monthly self-report</h3>
          <input type="month" value={month} onChange={(e) => loadMonth(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5" />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">What I delivered</label>
            <textarea rows={4} value={delivered} onChange={(e) => setDelivered(e.target.value)} className={field} placeholder="Key outcomes, projects shipped, wins…" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">Challenges / blockers</label>
            <textarea rows={3} value={challenges} onChange={(e) => setChallenges(e.target.value)} className={field} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">Goals for next month</label>
            <textarea rows={3} value={goals} onChange={(e) => setGoals(e.target.value)} className={field} />
          </div>
          <Button onClick={save} disabled={saving} className="gap-2 self-start">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Save report
          </Button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="surface-card divide-y divide-zinc-800/70 overflow-hidden">
          {rows.map((r) => (
            <button key={r.id} onClick={() => loadMonth(r.report_month.slice(0, 7))} className="w-full text-left px-4 py-2.5 hover:bg-zinc-800/40 transition-colors">
              <p className="text-sm text-zinc-100">{monthLabel(r.report_month.slice(0, 7))}</p>
              <p className="text-xs text-zinc-500 truncate">{r.delivered || "No summary"}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Issues ───────────────────────────────────────────────────────────────────
const ISSUE_TINT: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-300", in_review: "bg-blue-500/15 text-blue-300", resolved: "bg-green-500/15 text-green-300",
};
function IssuesTab({ initial }: { initial: IssueRow[] }) {
  const [rows, setRows] = useState<IssueRow[]>(initial);
  const [category, setCategory] = useState("other");
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);

  async function raise() {
    if (saving || subject.trim().length < 3 || detail.trim().length < 10) return;
    setSaving(true);
    try {
      const { issue } = await api.post<{ issue: IssueRow }>(ROUTES.myJob.issues(), { category, subject: subject.trim(), detail: detail.trim() }, { showErrorToast: false });
      setRows((prev) => [issue, ...prev]);
      setSubject(""); setDetail("");
      toast.success("Issue raised — RapidTal has been notified and will help mediate.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't raise the issue."); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-zinc-400">Something not working out? Raise it here and RapidTal will step in to mediate, rather than letting it fester into a failed placement. This goes to RapidTal, not your client.</p>
      </div>

      <div className="surface-card p-5">
        <h3 className="font-semibold text-zinc-100 mb-4">Raise an issue</h3>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wide text-zinc-500">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5">
                <option value="pay">Pay</option><option value="hours">Hours</option><option value="workload">Workload</option><option value="conduct">Conduct</option><option value="other">Other</option>
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className="text-[11px] uppercase tracking-wide text-zinc-500">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-2.5 py-1.5" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-zinc-500">What&apos;s going on</label>
            <textarea rows={4} value={detail} onChange={(e) => setDetail(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 resize-y" />
          </div>
          <Button onClick={raise} disabled={saving || subject.trim().length < 3 || detail.trim().length < 10} className="gap-2 self-start">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />} Raise issue
          </Button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="surface-card divide-y divide-zinc-800/70 overflow-hidden">
          {rows.map((r) => (
            <div key={r.id} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase tracking-wide text-zinc-500 bg-zinc-800 rounded px-1.5 py-0.5">{r.category}</span>
                <p className="text-sm text-zinc-100 font-medium flex-1 truncate">{r.subject}</p>
                <span className={cn("text-[11px] font-semibold rounded-full px-2.5 py-0.5 capitalize", ISSUE_TINT[r.status] ?? "bg-zinc-700 text-zinc-300")}>{r.status.replace("_", " ")}</span>
              </div>
              <p className="text-xs text-zinc-500">{r.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
