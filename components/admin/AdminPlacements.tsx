"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Handshake } from "lucide-react";

export interface AdminPlacementRow {
  id: string;
  status: string;
  vaName: string;
  clientPersonName: string;
  orgName: string | null;
  pageCount: number;
  lastActivityAt: string | null;
  lastActorRole: string | null;
}
interface Candidate { id: string; name: string; clientId: string }

const selectCls = "bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-200";
const statusCls: Record<string, string> = {
  active: "bg-green-500/15 text-green-300",
  paused: "bg-amber-500/15 text-amber-300",
  ended: "bg-zinc-700/50 text-zinc-400",
};

export function AdminPlacements({
  placements, clients, vas, clientContacts,
}: {
  placements: AdminPlacementRow[];
  clients: { id: string; name: string }[];
  vas: Candidate[];
  clientContacts: Candidate[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [vaId, setVaId] = useState("");
  const [contactId, setContactId] = useState("");
  const [busy, setBusy] = useState(false);

  const vasFor = vas.filter((v) => v.clientId === clientId);
  const contactsFor = clientContacts.filter((c) => c.clientId === clientId);

  async function create() {
    if (!clientId || !vaId || !contactId || busy) return;
    setBusy(true);
    try {
      const r = await api.post<{ seeded: number }>(ROUTES.admin.placements(), { clientId, vaUserId: vaId, clientUserId: contactId });
      toast.success(`Placement created — ${r.seeded} template pages seeded.`);
      setVaId(""); setContactId("");
      router.refresh();
    } catch { /* api-client toasts */ } finally { setBusy(false); }
  }

  async function setStatus(id: string, status: string) {
    try {
      await api.patch(ROUTES.admin.placements(), { id, status });
      toast.success("Status updated.");
      router.refresh();
    } catch { /* toasts */ }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Create */}
      <div className="surface-card p-4">
        <p className="label-section mb-3 flex items-center gap-2"><Handshake className="w-4 h-4" /> New placement</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">Client</label>
            <select value={clientId} onChange={(e) => { setClientId(e.target.value); setVaId(""); setContactId(""); }} className={selectCls}>
              <option value="">Select client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">VA</label>
            <select value={vaId} onChange={(e) => setVaId(e.target.value)} disabled={!clientId} className={selectCls}>
              <option value="">Select VA…</option>
              {vasFor.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">Client contact</label>
            <select value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={!clientId} className={selectCls}>
              <option value="">Select contact…</option>
              {contactsFor.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Button onClick={create} disabled={busy || !clientId || !vaId || !contactId} className="gap-1.5">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create & seed
          </Button>
        </div>
        <p className="text-xs text-zinc-500 mt-3">
          You manage the engagement here. You can never see Notebook page titles or content — only the activity metadata below.
        </p>
      </div>

      {/* Metadata table */}
      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-zinc-500 border-b border-zinc-800">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">VA</th>
              <th className="text-left font-medium px-4 py-2.5">Client contact</th>
              <th className="text-left font-medium px-4 py-2.5">Organisation</th>
              <th className="text-right font-medium px-4 py-2.5">Pages</th>
              <th className="text-left font-medium px-4 py-2.5">Last activity</th>
              <th className="text-left font-medium px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {placements.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">No placements yet.</td></tr>
            )}
            {placements.map((p) => (
              <tr key={p.id} className="border-b border-zinc-800/60 last:border-0">
                <td className="px-4 py-2.5 text-zinc-200">{p.vaName}</td>
                <td className="px-4 py-2.5 text-zinc-200">{p.clientPersonName}</td>
                <td className="px-4 py-2.5 text-zinc-400">{p.orgName ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-300">{p.pageCount}</td>
                <td className="px-4 py-2.5 text-zinc-400">
                  {p.lastActivityAt
                    ? <>{new Date(p.lastActivityAt).toLocaleDateString()} <span className="text-zinc-600">· last by {p.lastActorRole}</span></>
                    : <span className="text-zinc-600">No activity</span>}
                </td>
                <td className="px-4 py-2.5">
                  <select value={p.status} onChange={(e) => void setStatus(p.id, e.target.value)}
                    className={cn("rounded-full px-2.5 py-1 text-xs font-medium border-0 cursor-pointer", statusCls[p.status] ?? "bg-zinc-700/50 text-zinc-400")}>
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                    <option value="ended">ended</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
