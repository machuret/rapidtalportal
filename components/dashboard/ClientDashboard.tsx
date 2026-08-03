"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaskDialog } from "@/components/tasks/TaskDialog";
import { ClientFirstSuccessJourney } from "@/components/dashboard/ClientFirstSuccessJourney";
import type { ClientFirstSuccessStep } from "@/lib/onboarding/client-first-success";
import { awaitingApprovalCount } from "@/lib/dashboard/approval-count";
import {
  CheckCircle2, Clock, Inbox, Timer, Plus, Loader2, ThumbsUp, RotateCcw,
  ArrowRight, AlertTriangle,
} from "lucide-react";

export interface ClientVA { id: string; name: string }
export interface ClientCategory { id: string; name: string; color: string }
export interface AwaitingTask { id: string; title: string; description: string; assigneeName: string | null; updatedAt: string }
export interface DeliveredTask { id: string; title: string; completedAt: string; assigneeName: string | null }
export interface OverdueTask { id: string; title: string; assigneeName: string | null; dueDate: string; daysOverdue: number }
export interface DueSoonTask { id: string; title: string; assigneeName: string | null; dueDate: string; daysUntil: number }
export interface ClientAttentionItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  severity: "critical" | "warning" | "action";
}

export interface ClientDashboardProps {
  clientId: string;
  firstName: string;
  clientName: string;
  vas: ClientVA[];
  categories: ClientCategory[];
  awaiting: AwaitingTask[];
  contentAwaitingApproval: number;
  overdue: OverdueTask[];
  dueSoon: DueSoonTask[];
  attention: ClientAttentionItem[];
  stats: { inProgress: number; todo: number; completedThisWeek: number; hoursThisWeek: number; planHours: number | null };
  recentDelivered: DeliveredTask[];
  firstSuccess: ClientFirstSuccessStep[];
  firstSuccessUnavailable: boolean;
}

export function ClientDashboard(props: ClientDashboardProps) {
  const router = useRouter();
  const { firstName, clientName, vas, categories, stats } = props;
  const [awaiting, setAwaiting] = useState(props.awaiting);
  const [delivered, setDelivered] = useState(props.recentDelivered);
  const [requestMode, setRequestMode] = useState<"standard" | "starter" | null>(null);
  const [changesFor, setChangesFor] = useState<AwaitingTask | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // router.refresh() (e.g. after creating work) delivers new server props;
  // without this sync the lists kept showing the pre-refresh data forever.
  useEffect(() => { setAwaiting(props.awaiting); }, [props.awaiting]);
  useEffect(() => { setDelivered(props.recentDelivered); }, [props.recentDelivered]);

  const vaNames = vas.map((v) => v.name.trim()).filter(Boolean).join(", ");

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

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Welcome back, {firstName}</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {clientName}
            {vas.length > 0 && <> · your VA{vas.length > 1 ? "s" : ""}: <span className="text-zinc-300">{vaNames}</span></>}
          </p>
        </div>
        <Button onClick={() => setRequestMode("standard")} className="gap-1.5">
          <Plus className="w-4 h-4" /> Request work
        </Button>
      </div>

      <ClientFirstSuccessJourney
        clientId={props.clientId}
        steps={props.firstSuccess}
        onRequestWork={() => {
          void api.post(
            ROUTES.onboarding.events(),
            { clientId: props.clientId, step: "task", eventType: "step_viewed", metadata: {} },
            { showErrorToast: false },
          ).catch(() => undefined);
          setRequestMode("starter");
        }}
        unavailable={props.firstSuccessUnavailable}
      />

      {/* One bounded attention feed across the client journey. Detailed
          workspaces remain the place to resolve each item. */}
      {props.attention.length > 0 && (
        <div className={cn("rounded-xl border p-4 mb-6",
          props.attention.some((item) => item.severity === "critical") ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5")}>
          <p className="label-section mb-3 flex items-center gap-2 text-zinc-200">
            <AlertTriangle className={cn("w-4 h-4", props.attention.some((item) => item.severity === "critical") ? "text-red-300" : "text-amber-300")} />
            Needs attention
            <span className="text-amber-300">· {props.attention.length} item{props.attention.length === 1 ? "" : "s"}</span>
          </p>
          <ul className="flex flex-col gap-1.5">
            {props.attention.map((item) => (
              <li key={item.id} className="flex items-center gap-3 text-sm">
                <Link href={item.href} className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate text-zinc-200 hover:text-white">{item.title}</span>
                  <span className="block truncate text-xs text-zinc-500">{item.detail}</span>
                </Link>
                <span className={cn("shrink-0 rounded-full px-2 py-1 text-3xs font-medium uppercase tracking-wide",
                  item.severity === "critical" ? "bg-red-500/10 text-red-300" : item.severity === "action" ? "bg-blue-500/10 text-blue-300" : "bg-amber-500/10 text-amber-300")}>{item.severity === "action" ? "Review" : item.severity}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat
          icon={Inbox}
          tint="text-amber-400"
          label="Awaiting your approval"
          value={awaitingApprovalCount(awaiting.length, props.contentAwaitingApproval)}
        />
        <Stat icon={Clock} tint="text-blue-400" label="In progress" value={stats.inProgress} />
        <Stat icon={CheckCircle2} tint="text-green-400" label="Delivered this week" value={stats.completedThisWeek} />
        <Stat icon={Timer} tint="text-purple-400" label="Hours this week"
          value={stats.planHours ? `${stats.hoursThisWeek}` : stats.hoursThisWeek}
          suffix={stats.planHours ? ` / ${stats.planHours}h` : "h"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Awaiting approval */}
        <section className="surface-card p-4">
          <p className="label-section mb-3 flex items-center gap-2"><Inbox className="w-4 h-4" /> VA work awaiting approval</p>
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

      {requestMode && (
        <TaskDialog
          mode="create"
          status="todo"
          clientId={props.clientId}
          isAdmin
          initialAssignedTo={vas.length === 1 ? vas[0].id : undefined}
          members={vas}
          categories={categories}
          starterMode={requestMode === "starter"}
          onClose={() => setRequestMode(null)}
          onSaved={() => { setRequestMode(null); router.refresh(); }}
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
