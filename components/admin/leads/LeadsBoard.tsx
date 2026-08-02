"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { useResource } from "@/hooks/useResource";
import { useCrudDialog } from "@/hooks/useCrudDialog";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Loader2, Trash2, Save, Building2, User, Phone, Mail, CalendarClock, MessageSquarePlus } from "lucide-react";

export interface Lead {
  id: string; name: string; company: string | null; contact_name: string | null; email: string | null; phone: string | null;
  source: string | null; stage: string; value: number | null; owner_id: string | null;
  next_action: string | null; next_action_date: string | null; notes: string | null; sort_order: number;
  created_at: string; updated_at: string;
}
export interface LeadOwner { id: string; name: string }
interface LeadEvent { id: string; kind: string; body: string; created_at: string; user_id: string | null }

const STAGES: { key: string; label: string; accent: string }[] = [
  { key: "new",       label: "New",       accent: "border-t-zinc-500" },
  { key: "contacted", label: "Contacted", accent: "border-t-blue-500" },
  { key: "qualified", label: "Qualified", accent: "border-t-cyan-500" },
  { key: "proposal",  label: "Proposal",  accent: "border-t-amber-500" },
  { key: "won",       label: "Won",       accent: "border-t-green-500" },
  { key: "lost",      label: "Lost",      accent: "border-t-red-500" },
];

const money = (n: number | null | undefined) =>
  n == null ? "" : "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

export function LeadsBoard({ initialLeads, owners, currentUserId }: { initialLeads: Lead[]; owners: LeadOwner[]; currentUserId: string }) {
  const { items: leads, create, update, remove } = useResource<Lead>({
    key: ["admin", "leads"], route: ROUTES.admin.leads(), initial: initialLeads,
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const dragId = useRef<string | null>(null);

  const ownerName = (id: string | null) => owners.find((o) => o.id === id)?.name ?? null;
  const byStage = (stage: string) => leads.filter((l) => l.stage === stage).sort((a, b) => a.sort_order - b.sort_order || b.created_at.localeCompare(a.created_at));

  async function moveTo(id: string, stage: string) {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    // The hook applies the stage optimistically (matching field) and rolls back
    // on failure; the api client surfaces the error toast.
    try { await update({ id, stage }); } catch { /* rolled back */ }
  }

  const pipelineValue = leads.filter((l) => l.stage !== "lost").reduce((sum, l) => sum + (l.value ?? 0), 0);
  const wonValue = leads.filter((l) => l.stage === "won").reduce((sum, l) => sum + (l.value ?? 0), 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 mb-5">
        <div className="flex items-center gap-5 text-sm">
          <span className="text-zinc-400">Open pipeline <span className="text-white font-semibold tabular-nums">{money(pipelineValue)}</span></span>
          <span className="text-zinc-400">Won <span className="text-green-400 font-semibold tabular-nums">{money(wonValue)}</span></span>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-1.5 ml-auto"><Plus className="w-4 h-4" /> Add lead</Button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {STAGES.map((col) => {
          const items = byStage(col.key);
          const total = items.reduce((s, l) => s + (l.value ?? 0), 0);
          return (
            <div key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (dragId.current) void moveTo(dragId.current, col.key); dragId.current = null; }}
              className={cn("w-64 shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/60 border-t-2", col.accent)}>
              <div className="px-3 pt-3 pb-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-zinc-200">{col.label} <span className="text-zinc-500 font-normal">· {items.length}</span></p>
                  {total > 0 && <span className="text-xs text-zinc-500 tabular-nums">{money(total)}</span>}
                </div>
              </div>
              <div className="flex flex-col gap-2 p-2.5 pt-1 min-h-[60px]">
                {items.map((l) => {
                  const overdue = l.next_action_date && l.stage !== "won" && l.stage !== "lost" && l.next_action_date < new Date().toISOString().slice(0, 10);
                  return (
                    <div key={l.id} draggable onDragStart={() => { dragId.current = l.id; }} onClick={() => setEditing(l)}
                      role="button" tabIndex={0} aria-label={`Open ${l.name}`}
                      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setEditing(l); } }}
                      className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 cursor-grab active:cursor-grabbing hover:border-zinc-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 transition-colors">
                      <p className="text-sm font-medium text-zinc-100 leading-snug">{l.name}</p>
                      {l.company && <p className="text-xs text-zinc-500 mt-0.5 truncate">{l.company}</p>}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {l.value != null && <span className="text-xs font-semibold text-green-400 tabular-nums">{money(l.value)}</span>}
                        {l.next_action && (
                          <span className={cn("inline-flex items-center gap-1 text-2xs rounded-full px-2 py-0.5",
                            overdue ? "text-red-400 bg-red-500/10" : "text-zinc-400 bg-zinc-800")}>
                            <CalendarClock className="w-3 h-3" />{l.next_action_date ?? l.next_action}
                          </span>
                        )}
                        {l.owner_id && (
                          <span className="ml-auto w-5 h-5 rounded-full bg-zinc-700 text-3xs font-semibold flex items-center justify-center text-zinc-300" title={ownerName(l.owner_id) ?? ""}>
                            {(ownerName(l.owner_id) ?? "?").slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && <p className="text-xs text-zinc-600 text-center py-3">—</p>}
              </div>
            </div>
          );
        })}
      </div>

      {creating && (
        <LeadDialog mode="create" owners={owners} currentUserId={currentUserId}
          onClose={() => setCreating(false)}
          submit={(payload) => create(payload)} />
      )}
      {editing && (
        <LeadDialog mode="edit" lead={editing} owners={owners} currentUserId={currentUserId}
          onClose={() => setEditing(null)}
          submit={(payload) => update({ id: editing.id, ...payload })}
          onArchive={async () => { await remove({ id: editing.id }); setEditing(null); }} />
      )}
    </>
  );
}

function LeadDialog({ mode, lead, owners, currentUserId, onClose, submit, onArchive }: {
  mode: "create" | "edit"; lead?: Lead; owners: LeadOwner[]; currentUserId: string;
  onClose: () => void;
  submit: (payload: Record<string, unknown>) => Promise<unknown>;
  onArchive?: () => Promise<void>;
}) {
  const [f, setF] = useState({
    name: lead?.name ?? "", company: lead?.company ?? "", contactName: lead?.contact_name ?? "",
    email: lead?.email ?? "", phone: lead?.phone ?? "", source: lead?.source ?? "", stage: lead?.stage ?? "new",
    value: lead?.value != null ? String(lead.value) : "", ownerId: lead?.owner_id ?? currentUserId,
    nextAction: lead?.next_action ?? "", nextActionDate: lead?.next_action_date ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const selectCls = "bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300";

  const { busy, save, archive } = useCrudDialog({
    mode, onClose,
    onSubmit: () => submit({
      name: f.name.trim(), company: f.company || null, contactName: f.contactName || null,
      email: f.email || null, phone: f.phone || null, source: f.source || null, stage: f.stage,
      value: f.value ? Number(f.value) : null, ownerId: f.ownerId || null,
      nextAction: f.nextAction || null, nextActionDate: f.nextActionDate || null,
    }),
    onArchive,
    messages: { created: "Lead added.", saved: "Lead saved.", archived: "Lead archived." },
    archiveConfirm: () => (lead ? `Archive "${lead.name}"?` : null),
    canSave: () => f.name.trim().length >= 1,
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-700">
        <DialogHeader><DialogTitle>{mode === "create" ? "New lead" : f.name || "Lead"}</DialogTitle></DialogHeader>
        <div className="grid md:grid-cols-2 gap-5 mt-2">
          {/* Left: fields */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Deal / opportunity</Label>
              <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Acme Co — 2 VAs" className="bg-zinc-800 border-zinc-700" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5"><Label className="flex items-center gap-1"><Building2 className="w-3 h-3" />Company</Label>
                <Input value={f.company} onChange={(e) => set("company", e.target.value)} className="bg-zinc-800 border-zinc-700" /></div>
              <div className="flex flex-col gap-1.5"><Label className="flex items-center gap-1"><User className="w-3 h-3" />Contact</Label>
                <Input value={f.contactName} onChange={(e) => set("contactName", e.target.value)} className="bg-zinc-800 border-zinc-700" /></div>
              <div className="flex flex-col gap-1.5"><Label className="flex items-center gap-1"><Mail className="w-3 h-3" />Email</Label>
                <Input value={f.email} onChange={(e) => set("email", e.target.value)} className="bg-zinc-800 border-zinc-700" /></div>
              <div className="flex flex-col gap-1.5"><Label className="flex items-center gap-1"><Phone className="w-3 h-3" />Phone</Label>
                <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} className="bg-zinc-800 border-zinc-700" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5"><Label>Stage</Label>
                <select value={f.stage} onChange={(e) => set("stage", e.target.value)} className={selectCls}>
                  {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select></div>
              <div className="flex flex-col gap-1.5"><Label>Value ($)</Label>
                <Input type="number" min={0} value={f.value} onChange={(e) => set("value", e.target.value)} className="bg-zinc-800 border-zinc-700" /></div>
              <div className="flex flex-col gap-1.5"><Label>Owner</Label>
                <select value={f.ownerId ?? ""} onChange={(e) => set("ownerId", e.target.value)} className={selectCls}>
                  <option value="">Unassigned</option>
                  {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select></div>
              <div className="flex flex-col gap-1.5"><Label>Source</Label>
                <Input value={f.source} onChange={(e) => set("source", e.target.value)} placeholder="referral, inbound…" className="bg-zinc-800 border-zinc-700" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5"><Label>Next action</Label>
                <Input value={f.nextAction} onChange={(e) => set("nextAction", e.target.value)} placeholder="e.g. Send proposal" className="bg-zinc-800 border-zinc-700" /></div>
              <div className="flex flex-col gap-1.5"><Label>Action date</Label>
                <Input type="date" value={f.nextActionDate} onChange={(e) => set("nextActionDate", e.target.value)} className="bg-zinc-800 border-zinc-700" /></div>
            </div>
            <div className="flex justify-between gap-2 pt-1">
              {mode === "edit" ? (
                <Button variant="destructive" size="sm" onClick={archive} disabled={busy} className="gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Archive</Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose} className="border-zinc-700">Cancel</Button>
                <Button size="sm" onClick={save} disabled={busy || f.name.trim().length < 1} className="gap-1.5">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {mode === "create" ? "Add" : "Save"}
                </Button>
              </div>
            </div>
          </div>

          {/* Right: activity timeline (edit only) */}
          {mode === "edit" && lead && <LeadTimeline leadId={lead.id} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const KIND_LABEL: Record<string, string> = { note: "Note", call: "Call", email: "Email", meeting: "Meeting", stage: "Stage" };

function LeadTimeline({ leadId }: { leadId: string }) {
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [kind, setKind] = useState("note");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<LeadEvent[]>(ROUTES.admin.leadEventsForLead(leadId), { showErrorToast: false })
      .then((rows) => setEvents(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, [leadId]);

  async function add() {
    if (text.trim().length < 1 || busy) return;
    setBusy(true);
    try {
      const ev = await api.post<LeadEvent>(ROUTES.admin.leadEvents(), { leadId, kind, body: text.trim() });
      setEvents((e) => [ev, ...e]); setText("");
    } catch { /* toasts */ } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-2 border-l border-zinc-800 md:pl-5">
      <p className="label-section">Activity</p>
      <div className="flex gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-md px-2 h-9 text-sm text-zinc-300">
          {["note", "call", "email", "meeting"].map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
          placeholder="Log a note…" className="bg-zinc-800 border-zinc-700 flex-1" />
        <Button size="sm" onClick={add} disabled={busy || !text.trim()} className="gap-1 shrink-0">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquarePlus className="w-3.5 h-3.5" />}
        </Button>
      </div>
      <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto mt-1">
        {events.length === 0 && <p className="text-xs text-zinc-600 py-2">No activity yet.</p>}
        {events.map((e) => (
          <div key={e.id} className={cn("text-sm rounded-lg px-3 py-2", e.kind === "stage" ? "bg-zinc-800/40 text-zinc-400 italic" : "bg-zinc-800/70 text-zinc-200")}>
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="text-2xs font-medium uppercase tracking-wide text-zinc-500">{KIND_LABEL[e.kind] ?? e.kind}</span>
              <span className="text-2xs text-zinc-600">{timeAgo(e.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap">{e.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
