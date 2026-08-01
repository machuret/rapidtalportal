"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Clock3, Flag, Loader2, Pause, Plus, Target } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Goal = {
  id: string; title: string; outcome: string; status: "active" | "paused" | "achieved" | "abandoned";
  progress: number; target_date: string | null; achieved_at?: string | null; updated_at?: string;
};
type Commitment = {
  id: string; goal_id: string | null; commitment: string;
  status: "open" | "completed" | "snoozed" | "dismissed"; due_date: string | null;
  next_check_in_at: string | null; completed_at?: string | null; updated_at?: string;
};

function calendarDateInZone(value: Date, timeZone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-AU", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(value);
  } catch {
    parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(value);
  }
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function formatInstantDate(value: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone, day: "numeric", month: "short", year: "numeric",
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
    }).format(new Date(value));
  }
}

export function CoachProgressPanel({ clientId, timeZone = "UTC" }: { clientId: string; timeZone?: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [form, setForm] = useState<"none" | "goal" | "commitment">("none");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalOutcome, setGoalOutcome] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [commitment, setCommitment] = useState("");
  const [commitmentGoal, setCommitmentGoal] = useState("");
  const [commitmentDue, setCommitmentDue] = useState("");
  const [checkInDate, setCheckInDate] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ goals: Goal[]; commitments: Commitment[] }>(
        ROUTES.coach.progressForClient(clientId), { showErrorToast: false },
      );
      setGoals(result.goals);
      setCommitments(result.commitments);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("coach-progress-changed", refresh);
    return () => window.removeEventListener("coach-progress-changed", refresh);
  }, [load]);

  async function createGoal() {
    if (!goalTitle.trim() || busy) return;
    setBusy(true);
    try {
      await api.post(ROUTES.coach.progress(), {
        kind: "goal", clientId, title: goalTitle.trim(), outcome: goalOutcome.trim(),
        targetDate: goalDate || null, sourceTurnId: null,
      }, { showErrorToast: false });
      setGoalTitle(""); setGoalOutcome(""); setGoalDate(""); setForm("none");
      await load();
      toast.success("Goal added to your private coaching plan.");
    } catch (error) {
      toast.error(errorMessage(error, "The goal could not be saved."));
    } finally { setBusy(false); }
  }

  async function createCommitment() {
    if (!commitment.trim() || busy) return;
    setBusy(true);
    try {
      await api.post(ROUTES.coach.progress(), {
        kind: "commitment", clientId, commitment: commitment.trim(),
        goalId: commitmentGoal || null, dueDate: commitmentDue || null,
        checkInDate: checkInDate || null, sourceTurnId: null,
      }, { showErrorToast: false });
      setCommitment(""); setCommitmentGoal(""); setCommitmentDue(""); setCheckInDate(""); setForm("none");
      await load();
      toast.success(checkInDate ? "Commitment saved with weekly Coach check-ins until it is completed or dismissed." : "Commitment saved. The Coach will remember it.");
    } catch (error) {
      toast.error(errorMessage(error, "The commitment could not be saved."));
    } finally { setBusy(false); }
  }

  async function updateGoal(goal: Goal, status: Goal["status"], progress = goal.progress) {
    if (busy) return;
    setBusy(true);
    try {
      await api.patch(ROUTES.coach.progress(), {
        kind: "goal", clientId, id: goal.id, status, progress,
        targetDate: goal.target_date,
      }, { showErrorToast: false });
      await load();
    } catch (error) { toast.error(errorMessage(error, "The goal could not be updated.")); }
    finally { setBusy(false); }
  }

  async function updateCommitment(item: Commitment, status: Commitment["status"], checkIn?: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      await api.patch(ROUTES.coach.progress(), {
        kind: "commitment", clientId, id: item.id, status,
        dueDate: item.due_date, checkInDate: checkIn ?? (item.next_check_in_at ? calendarDateInZone(new Date(item.next_check_in_at), timeZone) : null),
      }, { showErrorToast: false });
      await load();
    } catch (error) { toast.error(errorMessage(error, "The commitment could not be updated.")); }
    finally { setBusy(false); }
  }

  const activeGoals = goals.filter((goal) => !["achieved", "abandoned"].includes(goal.status));
  const openCommitments = commitments.filter((item) => !["completed", "dismissed"].includes(item.status));
  const achievedGoals = goals.filter((goal) => goal.status === "achieved");
  const completedCommitments = commitments.filter((item) => item.status === "completed");
  const today = calendarDateInZone(new Date(), timeZone);
  const dueCount = openCommitments.filter((item) => item.due_date && item.due_date <= today).length;

  return (
    <div className="surface-card mb-4 overflow-hidden">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="coach-progress-body" className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-3">
          <span className="rounded-lg bg-purple-500/10 p-2 text-purple-300"><Target className="h-4 w-4" /></span>
          <span>
            <span className="block text-sm font-semibold text-zinc-100">My coaching plan</span>
            <span className="block text-xs text-zinc-500">
              {loading ? "Loading private progress…" : loadFailed ? "Private progress temporarily unavailable" : `${activeGoals.length} active goal${activeGoals.length === 1 ? "" : "s"} · ${openCommitments.length} open commitment${openCommitments.length === 1 ? "" : "s"}${dueCount ? ` · ${dueCount} due` : ""}`}
            </span>
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div id="coach-progress-body" className="border-t border-zinc-800 p-4">
          <p className="mb-4 text-xs leading-5 text-zinc-500">
            Only you can see this plan. Active items stay until you finish or stop them; completed history is removed after 12 months. The Coach never creates one without your approval.
          </p>
          {loadFailed && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-200/80">Your plan could not be loaded. The rest of Coach is still available, and no progress was changed.</p>
              <Button size="sm" variant="outline" onClick={() => { setLoading(true); void load(); }} className="border-amber-500/30 text-xs">Retry</Button>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400"><Target className="h-3.5 w-3.5" /> Goals</h3>
                <Button size="sm" variant="outline" onClick={() => setForm(form === "goal" ? "none" : "goal")} className="h-7 gap-1 border-zinc-700 text-xs"><Plus className="h-3 w-3" /> Add goal</Button>
              </div>
              {form === "goal" && (
                <div className="mb-3 grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                  <Input value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} maxLength={300} placeholder="What do you want to achieve?" aria-label="Goal title" />
                  <Textarea value={goalOutcome} onChange={(event) => setGoalOutcome(event.target.value)} maxLength={4000} rows={2} placeholder="What would success look like?" aria-label="Success outcome" />
                  <Input type="date" value={goalDate} onChange={(event) => setGoalDate(event.target.value)} aria-label="Target date" />
                  <Button size="sm" onClick={createGoal} disabled={busy || !goalTitle.trim()}>{busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}Save private goal</Button>
                </div>
              )}
              <div className="space-y-2">
                {activeGoals.map((goal) => (
                  <div key={goal.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                    <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium text-zinc-200">{goal.title}</p><span className="text-xs text-purple-300">{goal.progress}%</span></div>
                    {goal.outcome && <p className="mt-1 text-xs text-zinc-500">{goal.outcome}</p>}
                    <progress value={goal.progress} max={100} aria-label={`${goal.title} progress`} className="mt-2 h-1.5 w-full overflow-hidden rounded-full accent-purple-500" />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => updateGoal(goal, goal.status, Math.min(100, goal.progress + 25))} className="text-xs text-zinc-400 hover:text-white">+25%</button>
                      <button type="button" onClick={() => updateGoal(goal, goal.status === "paused" ? "active" : "paused")} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"><Pause className="h-3 w-3" /> {goal.status === "paused" ? "Resume" : "Pause"}</button>
                      <button type="button" onClick={() => updateGoal(goal, "achieved", 100)} className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300"><Check className="h-3 w-3" /> Achieved</button>
                      <button type="button" onClick={() => updateGoal(goal, "abandoned")} className="text-xs text-zinc-600 hover:text-zinc-400">Stop tracking</button>
                    </div>
                  </div>
                ))}
                {!loading && !activeGoals.length && <p className="rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">No active goals yet.</p>}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400"><Flag className="h-3.5 w-3.5" /> Commitments</h3>
                <Button size="sm" variant="outline" onClick={() => setForm(form === "commitment" ? "none" : "commitment")} className="h-7 gap-1 border-zinc-700 text-xs"><Plus className="h-3 w-3" /> Add commitment</Button>
              </div>
              {form === "commitment" && (
                <div className="mb-3 grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                  <Textarea value={commitment} onChange={(event) => setCommitment(event.target.value)} maxLength={1000} rows={2} placeholder="What will you do next?" aria-label="Commitment" />
                  <select value={commitmentGoal} onChange={(event) => setCommitmentGoal(event.target.value)} aria-label="Linked goal" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300"><option value="">No linked goal</option>{activeGoals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select>
                  <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs text-zinc-500">Due date<Input type="date" value={commitmentDue} onChange={(event) => setCommitmentDue(event.target.value)} className="mt-1" /></label><label className="text-xs text-zinc-500">Weekly Coach check-ins start<Input type="date" value={checkInDate} onChange={(event) => setCheckInDate(event.target.value)} className="mt-1" /></label></div>
                  <Button size="sm" onClick={createCommitment} disabled={busy || !commitment.trim()}>{busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}Save commitment</Button>
                </div>
              )}
              <div className="space-y-2">
                {openCommitments.map((item) => (
                  <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                    <p className="text-sm text-zinc-200">{item.commitment}</p>
                    <p className="mt-1 flex flex-wrap gap-3 text-xs text-zinc-500">{item.due_date && <span>Due {item.due_date}</span>}{item.next_check_in_at && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> Check-in {formatInstantDate(item.next_check_in_at, timeZone)}</span>}</p>
                    <div className="mt-2 flex flex-wrap gap-3"><button type="button" onClick={() => updateCommitment(item, "completed", null)} className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300"><Check className="h-3 w-3" /> Done</button><button type="button" onClick={() => updateCommitment(item, "snoozed", addCalendarDays(today, 7))} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"><Clock3 className="h-3 w-3" /> Check in next week</button><button type="button" onClick={() => updateCommitment(item, "dismissed", null)} className="text-xs text-zinc-600 hover:text-zinc-400">Dismiss</button></div>
                  </div>
                ))}
                {!loading && !openCommitments.length && <p className="rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">No open commitments yet.</p>}
              </div>
            </section>
          </div>
          {(achievedGoals.length > 0 || completedCommitments.length > 0) && (
            <details className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-zinc-400">
                Recent wins · {achievedGoals.length} goal{achievedGoals.length === 1 ? "" : "s"} · {completedCommitments.length} commitment{completedCommitments.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {achievedGoals.slice(0, 10).map((goal) => (
                  <div key={goal.id} className="rounded-lg border border-green-500/15 bg-green-500/5 p-3">
                    <p className="text-xs font-medium text-green-200">Goal achieved</p>
                    <p className="mt-1 text-sm text-zinc-300">{goal.title}</p>
                  </div>
                ))}
                {completedCommitments.slice(0, 10).map((item) => (
                  <div key={item.id} className="rounded-lg border border-green-500/15 bg-green-500/5 p-3">
                    <p className="text-xs font-medium text-green-200">Commitment completed</p>
                    <p className="mt-1 text-sm text-zinc-300">{item.commitment}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
