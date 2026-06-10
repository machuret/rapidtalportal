"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Search, Eye, EyeOff, Copy, Check, ExternalLink, Pencil, Trash2, Loader2, Save, KeyRound,
} from "lucide-react";

export interface AccessEntry {
  id: string;
  client_id: string;
  created_by: string | null;
  site: string;
  category: string;
  url: string;
  username: string;
  created_at: string;
  updated_at: string;
}

const CATEGORY_SUGGESTIONS = [
  "Website", "Hosting", "Email", "Social Media", "Ads", "E-commerce", "AI Tools", "Analytics", "Finance", "Other",
];

interface AccessClientProps {
  initialItems: AccessEntry[];
  clientId: string;
  isAdmin: boolean; // client_admin or super_admin — can add/edit/delete
}

export function AccessClient({ initialItems, clientId, isAdmin }: AccessClientProps) {
  const [items, setItems] = useState<AccessEntry[]>(initialItems);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AccessEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealBusy, setRevealBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      [i.site, i.category, i.url, i.username].some((f) => f.toLowerCase().includes(q)),
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, AccessEntry[]>();
    for (const item of filtered) {
      const key = item.category || "Other";
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  async function fetchPassword(id: string): Promise<string | null> {
    if (revealed[id]) return revealed[id];
    setRevealBusy(id);
    try {
      const { password } = await api.post<{ password: string }>(ROUTES.accessReveal(), { id });
      return password;
    } catch {
      return null;
    } finally {
      setRevealBusy(null);
    }
  }

  async function toggleReveal(id: string) {
    if (revealed[id]) {
      setRevealed((p) => { const n = { ...p }; delete n[id]; return n; });
      return;
    }
    const password = await fetchPassword(id);
    if (password !== null) setRevealed((p) => ({ ...p, [id]: password }));
  }

  async function copyValue(key: string, value: string | null) {
    if (value === null || value === "") return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard.");
    }
  }

  async function copyPassword(id: string) {
    const password = await fetchPassword(id);
    await copyValue(`pw:${id}`, password);
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sites, categories, usernames…"
            className="pl-9 bg-zinc-900 border-zinc-700"
          />
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add login
          </Button>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="surface-card rounded-xl p-10 text-center">
          <KeyRound className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">
            {items.length === 0
              ? isAdmin
                ? "No logins yet. Add the sites and tools your VAs need access to."
                : "No logins have been shared with you yet."
              : "Nothing matches your search."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(([category, entries]) => (
            <div key={category}>
              <p className="label-section mb-2">{category}</p>
              <div className="surface-card rounded-xl divide-y divide-zinc-800 overflow-hidden">
                {entries.map((entry) => {
                  const pw = revealed[entry.id];
                  return (
                    <div key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                      <div className="min-w-[160px] flex-1">
                        <p className="text-sm font-medium text-zinc-100">{entry.site}</p>
                        {entry.url && (
                          <a
                            href={entry.url.startsWith("http") ? entry.url : `https://${entry.url}`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-0.5"
                          >
                            {entry.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 min-w-[180px]">
                        <span className="text-xs text-zinc-500 shrink-0">User</span>
                        <span className="text-sm text-zinc-300 font-mono truncate max-w-[200px]">
                          {entry.username || "—"}
                        </span>
                        {entry.username && (
                          <button
                            onClick={() => void copyValue(`user:${entry.id}`, entry.username)}
                            title="Copy username"
                            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                          >
                            {copied === `user:${entry.id}` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 min-w-[220px]">
                        <span className="text-xs text-zinc-500 shrink-0">Pass</span>
                        <span className={cn("text-sm font-mono truncate max-w-[200px]", pw ? "text-zinc-300" : "text-zinc-600 tracking-widest")}>
                          {pw ?? "••••••••"}
                        </span>
                        <button
                          onClick={() => void toggleReveal(entry.id)}
                          title={pw ? "Hide password" : "Show password"}
                          className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                        >
                          {revealBusy === entry.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : pw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => void copyPassword(entry.id)}
                          title="Copy password"
                          className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                        >
                          {copied === `pw:${entry.id}` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            onClick={() => setEditing(entry)}
                            title="Edit"
                            className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <AccessDialog
          entry={editing ?? undefined}
          clientId={clientId}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={(saved) => {
            setItems((p) => (p.some((x) => x.id === saved.id) ? p.map((x) => (x.id === saved.id ? saved : x)) : [...p, saved]));
            // Drop any stale revealed plaintext for the edited entry.
            setRevealed((p) => { const n = { ...p }; delete n[saved.id]; return n; });
            setCreating(false); setEditing(null);
          }}
          onDeleted={(id) => {
            setItems((p) => p.filter((x) => x.id !== id));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function AccessDialog({
  entry, clientId, onClose, onSaved, onDeleted,
}: {
  entry?: AccessEntry;
  clientId: string;
  onClose: () => void;
  onSaved: (e: AccessEntry) => void;
  onDeleted: (id: string) => void;
}) {
  const [site, setSite] = useState(entry?.site ?? "");
  const [category, setCategory] = useState(entry?.category ?? "");
  const [url, setUrl] = useState(entry?.url ?? "");
  const [username, setUsername] = useState(entry?.username ?? "");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  const isEdit = !!entry;
  const canSave = site.trim() && category.trim() && (isEdit || password.length > 0);

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      if (isEdit) {
        const saved = await api.patch<AccessEntry>(ROUTES.access(), {
          id: entry.id,
          site: site.trim(),
          category: category.trim(),
          url: url.trim(),
          username: username.trim(),
          ...(password ? { password } : {}),
        });
        toast.success("Login updated.");
        onSaved(saved);
      } else {
        const saved = await api.post<AccessEntry>(ROUTES.access(), {
          clientId,
          site: site.trim(),
          category: category.trim(),
          url: url.trim(),
          username: username.trim(),
          password,
        });
        toast.success("Login added.");
        onSaved(saved);
      }
    } catch { /* api-client surfaces a toast */ } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!entry || busy) return;
    if (!confirm(`Delete the login for "${entry.site}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api.delete(ROUTES.access(), { id: entry.id });
      toast.success("Login deleted.");
      onDeleted(entry.id);
    } catch { /* api-client surfaces a toast */ } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit login" : "Add login"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Site</Label>
              <Input value={site} onChange={(e) => setSite(e.target.value)}
                placeholder="e.g. WordPress Admin" className="bg-zinc-800 border-zinc-700" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} list="access-categories"
                placeholder="e.g. Website" className="bg-zinc-800 border-zinc-700" />
              <datalist id="access-categories">
                {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/wp-admin" className="bg-zinc-800 border-zinc-700" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off"
                placeholder="login or email" className="bg-zinc-800 border-zinc-700" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{isEdit ? "New password (leave blank to keep)" : "Password"}</Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={isEdit ? "Unchanged" : "••••••••"}
                  className="bg-zinc-800 border-zinc-700 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            Passwords are encrypted (AES-256) before they&apos;re stored — nobody can read them from the database.
          </p>
          <div className="flex justify-between gap-2 pt-1">
            <div>
              {isEdit && (
                <Button type="button" variant="destructive" size="sm" onClick={remove} disabled={busy} className="gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} className="border-zinc-700">
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={busy || !canSave} className="gap-1.5">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {isEdit ? "Save" : "Add login"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
