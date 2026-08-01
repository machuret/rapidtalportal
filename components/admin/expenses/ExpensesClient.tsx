"use client";

import { useMemo, useState } from "react";
import { useResource } from "@/hooks/useResource";
import { useCrudDialog } from "@/hooks/useCrudDialog";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CADENCES, summarizeByCurrency, type Cadence } from "@/lib/expenses/cadence";
import { Plus, Loader2, Trash2, Save, ExternalLink, Search, Wallet, CalendarClock, Repeat } from "lucide-react";

export interface Expense {
  id: string; name: string; vendor: string | null; category: string; amount: number; currency: string;
  cadence: string; status: string; next_due_date: string | null; url: string | null; started_on: string | null;
  owner_id: string | null; notes: string | null; created_at: string; updated_at: string;
}

const CATEGORIES = ["Software", "Subscription", "Hosting", "Domain", "Website", "Marketing", "Contractor", "Office", "Other"];
const CURRENCIES = ["USD", "AUD", "PHP", "EUR", "GBP", "CAD", "NZD", "SGD", "INR"];
const cadenceLabel = (c: string) => CADENCES.find((x) => x.key === c)?.label ?? c;

function fmtMoney(amount: number, currency: string): string {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString()}`; }
}

export function ExpensesClient({ initial }: { initial: Expense[] }) {
  const { items: expenses, create, update, remove } = useResource<Expense>({
    key: ["admin", "expenses"], route: ROUTES.admin.expenses(), initial,
  });
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const totals = useMemo(() => summarizeByCurrency(expenses), [expenses]);
  const soon = useMemo(() => {
    const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    return expenses.filter((e) => e.status === "active" && e.next_due_date && e.next_due_date >= today && e.next_due_date <= in30).length;
  }, [expenses]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses
      .filter((e) => showCancelled || e.status === "active")
      .filter((e) => !q || `${e.name} ${e.vendor ?? ""} ${e.category}`.toLowerCase().includes(q))
      .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === "active" ? -1 : 1));
  }, [expenses, search, showCancelled]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="surface-card p-4">
          <p className="label-section mb-2 flex items-center gap-2"><Repeat className="w-4 h-4 text-blue-400" /> Monthly run-rate</p>
          {totals.length === 0 ? <p className="text-sm text-zinc-500">No recurring spend.</p> : (
            <div className="flex flex-col gap-0.5">
              {totals.map((t) => (
                <p key={t.currency} className="text-sm text-zinc-200">
                  <span className="font-bold tabular-nums">{fmtMoney(t.monthly, t.currency)}</span>
                  <span className="text-zinc-500"> /mo · {fmtMoney(t.yearly, t.currency)}/yr</span>
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="surface-card p-4">
          <p className="label-section mb-2 flex items-center gap-2"><Wallet className="w-4 h-4 text-green-400" /> Active items</p>
          <p className="text-3xl font-bold text-white tabular-nums">{expenses.filter((e) => e.status === "active").length}</p>
        </div>
        <div className="surface-card p-4">
          <p className="label-section mb-2 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-amber-400" /> Due in 30 days</p>
          <p className="text-3xl font-bold text-white tabular-nums">{soon}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative flex-1 min-w-[12rem] max-w-sm">
          <Search className="w-4 h-4 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search expenses…" className="bg-zinc-800 border-zinc-700 pl-8" />
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="accent-zinc-500" />
          Show cancelled
        </label>
        <Button onClick={() => setCreating(true)} className="gap-1.5 ml-auto"><Plus className="w-4 h-4" /> Add expense</Button>
      </div>

      {/* Table */}
      <div className="surface-card overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-xs text-zinc-500 border-b border-zinc-800">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Name</th>
              <th className="text-left font-medium px-4 py-2.5">Category</th>
              <th className="text-right font-medium px-4 py-2.5">Amount</th>
              <th className="text-left font-medium px-4 py-2.5">Cadence</th>
              <th className="text-left font-medium px-4 py-2.5">Next due</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-500">No expenses yet. Add your first.</td></tr>}
            {rows.map((e) => {
              const overdue = e.status === "active" && e.next_due_date && e.next_due_date < today;
              return (
                <tr key={e.id} onClick={() => setEditing(e)}
                  role="button" tabIndex={0} aria-label={`Edit ${e.name}`}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setEditing(e); } }}
                  className={cn("border-b border-zinc-800/60 last:border-0 cursor-pointer hover:bg-zinc-800/40 focus:bg-zinc-800/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 transition-colors", e.status === "cancelled" && "opacity-50")}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-100 font-medium">{e.name}</span>
                      {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()} className="text-zinc-500 hover:text-blue-400" aria-label="Open link"><ExternalLink className="w-3.5 h-3.5" /></a>}
                    </div>
                    {e.vendor && <p className="text-xs text-zinc-500">{e.vendor}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400">{e.category}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-200">{fmtMoney(e.amount, e.currency)}</td>
                  <td className="px-4 py-2.5 text-zinc-400">{cadenceLabel(e.cadence)}{e.status === "cancelled" && <span className="text-red-400"> · cancelled</span>}</td>
                  <td className={cn("px-4 py-2.5", overdue ? "text-red-400" : "text-zinc-400")}>{e.next_due_date ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-600">›</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {creating && (
        <ExpenseDialog mode="create" onClose={() => setCreating(false)}
          submit={(payload) => create(payload)} />
      )}
      {editing && (
        <ExpenseDialog mode="edit" expense={editing} onClose={() => setEditing(null)}
          submit={(payload) => update({ id: editing.id, ...payload })}
          onArchive={async () => { await remove({ id: editing.id }); setEditing(null); }} />
      )}
    </div>
  );
}

function ExpenseDialog({ mode, expense, onClose, submit, onArchive }: {
  mode: "create" | "edit"; expense?: Expense; onClose: () => void;
  submit: (payload: Record<string, unknown>) => Promise<unknown>;
  onArchive?: () => Promise<void>;
}) {
  const [f, setF] = useState({
    name: expense?.name ?? "", vendor: expense?.vendor ?? "", category: expense?.category ?? "Software",
    amount: expense?.amount != null ? String(expense.amount) : "", currency: expense?.currency ?? "USD",
    cadence: (expense?.cadence ?? "monthly") as Cadence, status: expense?.status ?? "active",
    nextDueDate: expense?.next_due_date ?? "", url: expense?.url ?? "", startedOn: expense?.started_on ?? "", notes: expense?.notes ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const selectCls = "bg-zinc-800 border border-zinc-700 rounded-md px-3 h-9 text-sm text-zinc-300";

  const { busy, save, archive } = useCrudDialog({
    mode, onClose,
    onSubmit: () => submit({
      name: f.name.trim(), vendor: f.vendor || null, category: f.category,
      amount: Number(f.amount) || 0, currency: f.currency, cadence: f.cadence, status: f.status,
      nextDueDate: f.nextDueDate || null, url: f.url || null, startedOn: f.startedOn || null, notes: f.notes || null,
    }),
    onArchive,
    messages: { created: "Expense added.", saved: "Saved.", archived: "Archived." },
    archiveConfirm: () => (expense ? `Archive "${expense.name}"?` : null),
    canSave: () => f.name.trim().length >= 1,
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-700">
        <DialogHeader><DialogTitle>{mode === "create" ? "Add expense" : f.name || "Expense"}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 col-span-2"><Label>Name</Label>
              <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Vercel Pro" className="bg-zinc-800 border-zinc-700" /></div>
            <div className="flex flex-col gap-1.5"><Label>Vendor</Label>
              <Input value={f.vendor} onChange={(e) => set("vendor", e.target.value)} className="bg-zinc-800 border-zinc-700" /></div>
            <div className="flex flex-col gap-1.5"><Label>Category</Label>
              <select value={f.category} onChange={(e) => set("category", e.target.value)} className={selectCls}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div className="flex flex-col gap-1.5"><Label>Amount</Label>
              <Input type="number" min={0} step="0.01" value={f.amount} onChange={(e) => set("amount", e.target.value)} className="bg-zinc-800 border-zinc-700" /></div>
            <div className="flex flex-col gap-1.5"><Label>Currency</Label>
              <select value={f.currency} onChange={(e) => set("currency", e.target.value)} className={selectCls}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div className="flex flex-col gap-1.5"><Label>Cadence</Label>
              <select value={f.cadence} onChange={(e) => set("cadence", e.target.value)} className={selectCls}>
                {CADENCES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select></div>
            <div className="flex flex-col gap-1.5"><Label>Status</Label>
              <select value={f.status} onChange={(e) => set("status", e.target.value)} className={selectCls}>
                <option value="active">Active</option><option value="cancelled">Cancelled</option>
              </select></div>
            <div className="flex flex-col gap-1.5"><Label>Next due</Label>
              <Input type="date" value={f.nextDueDate} onChange={(e) => set("nextDueDate", e.target.value)} className="bg-zinc-800 border-zinc-700" /></div>
            <div className="flex flex-col gap-1.5"><Label>Started</Label>
              <Input type="date" value={f.startedOn} onChange={(e) => set("startedOn", e.target.value)} className="bg-zinc-800 border-zinc-700" /></div>
            <div className="flex flex-col gap-1.5 col-span-2"><Label>URL</Label>
              <Input value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" className="bg-zinc-800 border-zinc-700" /></div>
          </div>
          <div className="flex justify-between gap-2 pt-1">
            {mode === "edit" ? <Button variant="destructive" size="sm" onClick={archive} disabled={busy} className="gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Archive</Button> : <span />}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose} className="border-zinc-700">Cancel</Button>
              <Button size="sm" onClick={save} disabled={busy || f.name.trim().length < 1} className="gap-1.5">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {mode === "create" ? "Add" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
