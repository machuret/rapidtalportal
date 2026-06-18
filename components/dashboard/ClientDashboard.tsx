"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CheckCircle2, Clock, Inbox, Timer, Plus, Loader2, ThumbsUp, RotateCcw,
  Sparkles, ArrowRight, AlertTriangle,
} from "lucide-react";

export interface ClientVA { id: string; name: string }
export interface ClientCategory { id: string; name: string; color: string }
export interface AwaitingTask { id: string; title: string; description: string; assigneeName: string | null; updatedAt: string }
export interface DeliveredTask { id: string; title: string; completedAt: string; assigneeName: string | null }
export interface OverdueTask { id: string; title: string; assigneeName: string | null; dueDate: string; daysOverdue: number }
export interface DueSoonTask { id: string; title: string; assigneeName: string | null; dueDate: string; daysUntil: number }

export interface ClientDashboardProps {
  clientId: string;
  firstName: string;
  clientName: string;
  vas: ClientVA[];
  categories: ClientCategory[];
  awaiting: AwaitingTask[];
  overdue: OverdueTask[];
  dueSoon: DueSoonTask[];
  stats: { inProgress: number; todo: number; completedThisWeek: number; hoursThisWeek: number; planHours: number | null };
  recentDelivered: DeliveredTask[];
  onboarding: { dna: boolean; docs: boolean; va: boolean; firstTask: boolean };
}

const dueLabel = (daysUntil: number) =>
  daysUntil <= 0 ? "due today" : daysUntil === 1 ? "due tomorrow" : `due in ${daysUntil} days`;

export function ClientDashboard(props: ClientDashboardProps) {
  const router = useRouter();
  const { firstName, clientName, vas, categories, stats } = props;
  const [awaiting, setAwaiting] = useState(props.awaiting);
  const [delivered, setDelivered] = useState(props.recentDelivered);
  const [requestOpen, setRequestOpen] = useState(false);
  const [changesFor, setChangesFor] = useState<AwaitingTask | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const vaNames = vas.map((v) => v.name.split(" ")[0]).join(", ");

  async function decide(task: AwaitingTask, decision: "approve" | "changes", note?: string) {
    setBusy(task.id);
    try {
      await api.post(ROUTES.taskReview(), { id: task.id, decision, note });
      setAwaiting((a) => a.filter((t) => t.id !== task.id));
      if (decision === "approve") {
        setDelivered((d) => [{ id: task.id, title: task.title, completedAt: new Date().toISOString(), assigneeName: task.assigneeName }, ...d].slice(0, 8));
        toast.success("Approved — your VA has been notified.");
      } else {
        toast.success("Sent back with your notes.");
      }
      setChangesFor(null);
    } catch { /* api-client toasts */ } finally { setBusy(null); }
  }

  const onboardingSteps = [
    { key: "dna", done: props.onboarding.dna, label: "Fill in your Company DNA", desc: "Tell the AI who you are — the more it knows, the better it answers.", href: "/company-dna", optional: false },
    { key: "docs", done: props.onboarding.docs, label: "Add a few key documents", desc: "Optional — drop in SOPs, guides or policies so your VA and the AI can use them.", href: "/vault", optional: true },
    { key: "va", done: props.onboarding.va, label: "Meet your VA", desc: vas.length ? `You're working with ${vaNames}.` : "Your VA will appear here once you're placed.", href: "/team", optional: false },
    { key: "firstTask", done: props.onboarding.firstTask, label: "Request your first task", desc: "Tell your VA what you need done.", href: null, optional: false },
  ];
  // Onboarding is "complete" when all NON-optional steps are done.
  const onboardingDone = onboardingSteps.filter((s) => !s.optional).every((s) => s.done);

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Welcome back, {firstName}</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {clientName}
            {vas.length > 0 && <> · your VA{vas.length > 1 ? "s" : ""}: <span className="text-zinc-300">{vaNames}</span></>}
          </p>
        </div>
        <Button onClick={() => setRequestOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Request work
        </Button>
      </div>

      {/* Onboarding (until the required steps are done) */}
      {!onboardingDone && (
        <div className="surface-card p-4 mb-6">
          <p className="label-section mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-400" /> Get set up</p>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {onboardingSteps.map((s) => {
              const inner = (
                <div className={cn("flex items-start gap-3 rounded-lg border p-3 h-full transition-colors",
                  s.done ? "border-green-500/20 bg-green-500/5" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700")}>
                  {s.done
                    ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                    : <div className="w-4 h-4 rounded-full border border-zinc-600 shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100">
                      {s.label}{s.optional && <span className="text-zinc-500 font-normal"> · optional</span>}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">{s.desc}</p>
                  </div>
                  {!s.done && <ArrowRight className="w-3.5 h-3.5 text-zinc-600 shrink-0 ml-auto mt-1" />}
                </div>
              );
              if (s.key === "firstTask" && !s.done) {
                return <button key={s.key} onClick={() => setRequestOpen(true)} className="text-left">{inner}</button>;
              }
              return s.href ? <Link key={s.key} href={s.href}>{inner}</Link> : <div key={s.key}>{inner}</div>;
            })}
          </div>
        </div>
      )}

      {/* Needs attention — overdue work (red) and what's coming due in 48h (amber).
          Border leads with the worst tier present. */}
      {(props.overdue.length > 0 || props.dueSoon.length > 0) && (
        <div className={cn("rounded-xl border p-4 mb-6",
          props.overdue.length > 0 ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5")}>
          <p className="label-section mb-3 flex items-center gap-2 text-zinc-200">
            <AlertTriangle className={cn("w-4 h-4", props.overdue.length > 0 ? "text-red-300" : "text-amber-300")} />
            Needs attention
            {props.overdue.length > 0 && <span className="text-red-300">· {props.overdue.length} overdue</span>}
            {props.dueSoon.length > 0 && <span className="text-amber-300">· {props.dueSoon.length} due soon</span>}
          </p>
          <ul className="flex flex-col gap-1.5">
            {props.overdue.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="text-zinc-200 truncate flex-1">{t.title}</span>
                {t.assigneeName && <span className="text-xs text-zinc-500 shrink-0">{t.assigneeName.split(" ")[0]}</span>}
                <span className="text-xs font-medium text-red-400 shrink-0 tabular-nums">
                  {t.daysOverdue === 1 ? "1 day" : `${t.daysOverdue} days`} late
                </span>
              </li>
            ))}
            {props.dueSoon.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="text-zinc-200 truncate flex-1">{t.title}</span>
                {t.assigneeName && <span className="text-xs text-zinc-500 shrink-0">{t.assigneeName.split(" ")[0]}</span>}
                <span className="text-xs font-medium text-amber-400 shrink-0 tabular-nums">{dueLabel(t.daysUntil)}</span>
              </li>
            ))}
          </ul>
          <Link href="/tasks" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white mt-3 transition-colors">
            Review on the board <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat icon={Inbox} tint="text-amber-400" label="Awaiting your approval" value={awaiting.length} />
        <Stat icon={Clock} tint="text-blue-400" label="In progress" value={stats.inProgress} />
        <Stat icon={CheckCircle2} tint="text-green-400" label="Delivered this week" value={stats.completedThisWeek} />
        <Stat icon={Timer} tint="text-purple-400" label="Hours this week"
          value={stats.planHours ? `${stats.hoursThisWeek}` : stats.hoursThisWeek}
          suffix={stats.planHours ? ` / ${stats.planHours}h` : "h"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Awaiting approval */}
        <section className="surface-card p-4">
          <p className="label-section mb-3 flex items-center gap-2"><Inbox className="w-4 h-4" /> Awaiting your approval</p>
          {awaiting.length === 0 ? (
            <p className="text-sm text-zinc-500 py-6 text-center">Nothing waiting on you. 🎉</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {awaiting.map((t) => (
                <li key={t.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  <p className="text-sm font-medium text-zinc-100">{t.title}</p>
                  {t.description.trim() && <p className="text-xs text-zinc-500 mt-1 line-clamp-2 whitespace-pre-wrap">{t.description}</p>}
                  <div className="flex items-center gap-2 mt-2.5">
                    <span className="text-xs text-zinc-500 mr-auto">{t.assigneeName ? `from ${t.assigneeName.split(" ")[0]}` : ""} · <RelativeTime value={t.updatedAt} /></span>
                    <Button size="sm" variant="outline" className="gap-1 h-7 border-zinc-700"
                      disabled={busy === t.id} onClick={() => setChangesFor(t)}>
                      <RotateCcw className="w-3 h-3" /> Changes
                    </Button>
                    <Button size="sm" className="gap-1 h-7" disabled={busy === t.id} onClick={() => decide(t, "approve")}>
                      {busy === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />} Approve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recently delivered */}
        <section className="surface-card p-4">
          <p className="label-section mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Recently delivered</p>
          {delivered.length === 0 ? (
            <p className="text-sm text-zinc-500 py-6 text-center">Completed work will show up here.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {delivered.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  <span className="text-zinc-300 truncate flex-1">{t.title}</span>
                  <span className="text-xs text-zinc-600 shrink-0"><RelativeTime value={t.completedAt} /></span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/tasks" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-white mt-3 transition-colors">
            See the full board <ArrowRight className="w-3 h-3" />
          </Link>
        </section>
      </div>

      {requestOpen && (
        <RequestWorkDialog
          clientId={props.clientId} vas={vas} categories={categories}
          onClose={() => setRequestOpen(false)}
          onCreated={() => { setRequestOpen(false); toast.success("Request sent to your VA."); router.refresh(); }}
        />
      )}

      {changesFor && (
        <ChangesDialog
          task={changesFor} busy={busy === changesFor.id}
          onClose={() => setChangesFor(null)}
          onSubmit={(note) => decide(changesFor, "changes", note)}
        />
      )}
    </div>
  );
}

function Stat({ icon: Icon, tint, label, value, suffix }: { icon: typeof Inbox; tint: string; label: string; value: number | string; suffix?: string }) {
  return (
    <div className="surface-card p-3.5">
      <Icon className={cn("w-4 h-4 mb-2", tint)} />
      <p className="text-2xl font-bold text-white leading-none tabular-nums">{value}<span className="text-base text-zinc-500 font-medium">{suffix}</span></p>
      <p className="text-xs text-zinc-500 mt-1">{label}</p>
    </div>
  );
}

function RequestWorkDialog({ clientId, vas, categories, onClose, onCreated }: {
  clientId: string; vas: ClientVA[]; categories: ClientCategory[]; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState(vas.length === 1 ? vas[0].id : "");
  const [priority, setPriority] = useState(2);
  const [dueDate, setDueDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const selectCls = "bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300";

  async function submit() {
    if (title.trim().length < 1 || busy) return;
    setBusy(true);
    try {
      await api.post(ROUTES.tasks(), {
        clientId, title: title.trim(), description, status: "todo", priority,
        assignedTo: assignedTo || null, dueDate: dueDate || null, categoryId: categoryId || null,
      });
      onCreated();
    } catch { /* toasts */ } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-700">
        <DialogHeader><DialogTitle>Request work</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label>What do you need done?</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
              placeholder="e.g. Draft the June newsletter" className="bg-zinc-800 border-zinc-700" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Details</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
              placeholder="Context, links, examples, anything that helps your VA get it right…" className="bg-zinc-800 border-zinc-700" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Assign to</Label>
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={selectCls}>
                <option value="">Any available VA</option>
                {vas.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} className={selectCls}>
                <option value={1}>Low</option><option value={2}>Normal</option><option value={3}>High</option><option value={4}>Urgent</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Needed by</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-zinc-800 border-zinc-700" />
            </div>
            {categories.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectCls}>
                  <option value="">None</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose} className="border-zinc-700">Cancel</Button>
            <Button size="sm" onClick={submit} disabled={busy || title.trim().length < 1} className="gap-1.5">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Send request
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChangesDialog({ task, busy, onClose, onSubmit }: {
  task: AwaitingTask; busy: boolean; onClose: () => void; onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-700">
        <DialogHeader><DialogTitle>Request changes</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 mt-2">
          <p className="text-sm text-zinc-400">“{task.title}” will go back to your VA{task.assigneeName ? `, ${task.assigneeName.split(" ")[0]},` : ""} with your notes.</p>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} autoFocus
            placeholder="What needs changing?" className="bg-zinc-800 border-zinc-700" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="border-zinc-700">Cancel</Button>
            <Button size="sm" onClick={() => onSubmit(note)} disabled={busy || note.trim().length < 1} className="gap-1.5">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Send back
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
