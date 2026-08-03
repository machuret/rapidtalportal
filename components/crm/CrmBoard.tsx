"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmContact } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CRM_STATUS_META, CRM_STATUSES } from "@/lib/crm/config";
import { Plus, Search, User, Archive } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CrmContactCard } from "./CrmContactCard";
import { CrmDetailPanel } from "./CrmDetailPanel";

// Status config imported from shared lib
const STATUS_META = CRM_STATUS_META;
const STATUSES = CRM_STATUSES;

// ── Props ─────────────────────────────────────────────────────────────────────
interface CrmBoardProps {
  contacts: CrmContact[];
  clientId: string;
  userId: string;
  isAdmin: boolean;
  initialContactId?: string | null;
}

type Note = { id: string; body: string; created_at: string };

// ── Component ─────────────────────────────────────────────────────────────────
export function CrmBoard({ contacts: initial, clientId, isAdmin, initialContactId = null }: CrmBoardProps) {
  const router = useRouter();
  // Read-only Supabase browser client — only used for SELECT (notes fetch)
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [allContacts, setAllContacts] = useState<CrmContact[]>(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  // Detail panel state
  const [selected, setSelected] = useState<CrmContact | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const notesCacheRef = useRef<Map<string, Note[]>>(new Map());

  const setContacts = setAllContacts;
  const archivedCount = allContacts.filter(c => c.archived_at).length;
  // Active board by default; flip to the archived list with the toggle.
  const contacts = allContacts.filter(c => showArchived ? !!c.archived_at : !c.archived_at);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || [c.first_name, c.last_name, c.email, c.company, c.phone, c.job_title]
      .some(v => v?.toLowerCase().includes(q));
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const openContact = useCallback(async (c: CrmContact) => {
    setSelected(c);
    if (notesCacheRef.current.has(c.id)) {
      setNotes(notesCacheRef.current.get(c.id)!);
      return;
    }
    setLoadingNotes(true);
    const { data } = await supabase
      .from("crm_notes")
      .select("id, body, created_at")
      .eq("contact_id", c.id)
      .order("created_at", { ascending: false });
    const fetched = (data ?? []) as Note[];
    notesCacheRef.current.set(c.id, fetched);
    setNotes(fetched);
    setLoadingNotes(false);
  }, [supabase]);

  const openedFromUrl = useRef<string | null>(null);
  useEffect(() => {
    if (!initialContactId || openedFromUrl.current === initialContactId) return;
    const contact = allContacts.find((candidate) => candidate.id === initialContactId);
    if (!contact) return;
    openedFromUrl.current = initialContactId;
    void openContact(contact);
  }, [allContacts, initialContactId, openContact]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[600px]">

      {/* ── Left: contact list ──────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Toolbar */}
        <div className="flex gap-2 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, company…"
              className="pl-9 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {["all", ...STATUSES].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  statusFilter === s
                    ? s === "all"
                      ? "bg-zinc-700 text-white border-zinc-600"
                      : STATUS_META[s]?.cls
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                )}
              >
                {s === "all" ? "All" : STATUS_META[s]?.label}
              </button>
            ))}
          </div>
          {archivedCount > 0 && (
            <button
              onClick={() => { setShowArchived(s => !s); setStatusFilter("all"); setSelected(null); }}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0",
                showArchived
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
              )}
            >
              <Archive className="w-3.5 h-3.5" />
              {showArchived ? "Back to active" : `Archived (${archivedCount})`}
            </button>
          )}
          <Button
            onClick={() => router.push("/crm/add-contact")}
            className="gap-1.5 bg-orange-500 hover:bg-orange-400 text-zinc-950 shrink-0"
          >
            <Plus className="w-4 h-4" /> Add Contact
          </Button>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mb-4">
          {STATUSES.map(s => {
            const count = contacts.filter(c => c.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                className={cn(
                  "flex flex-col items-center px-3 py-2 rounded-xl border text-center transition-colors min-w-[64px]",
                  statusFilter === s ? STATUS_META[s].cls : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                )}
              >
                <span className="text-lg font-bold text-zinc-100">{count}</span>
                <span className="text-xs text-zinc-500">{STATUS_META[s].label}</span>
              </button>
            );
          })}
        </div>

        {/* Contact cards */}
        {filtered.length === 0 ? (
          <div className="flex-1 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 flex flex-col items-center justify-center gap-3 py-20">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
              <User className="w-6 h-6 text-zinc-600" />
            </div>
            <p className="text-zinc-300 font-semibold">{contacts.length === 0 ? "No contacts yet" : "No results"}</p>
            {contacts.length === 0 && (
              <Button variant="outline" onClick={() => router.push("/crm/add-contact")} className="border-zinc-700 text-zinc-300 mt-1">
                <Plus className="w-4 h-4 mr-1.5" /> Add your first contact
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(c => (
            <CrmContactCard
              key={c.id}
              contact={c}
              isSelected={selected?.id === c.id}
              onClick={() => openContact(c)}
            />
          ))}
          </div>
        )}

        <p className="text-xs text-zinc-600 mt-4">
          {filtered.length} of {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
        </p>
      </div>

      {selected && (
        <CrmDetailPanel
          contact={selected}
          notes={notes}
          loadingNotes={loadingNotes}
          clientId={clientId}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onUpdated={updated => {
            setContacts(cs => cs.map(c => c.id === updated.id ? updated : c));
            // Archiving/restoring moves it out of the current view — close the panel.
            if (!!updated.archived_at !== showArchived) setSelected(null);
            else setSelected(updated);
          }}
          onDeleted={id => {
            setContacts(cs => cs.filter(c => c.id !== id));
            setSelected(null);
          }}
          onNoteAdded={note => {
            const updated = [note, ...notes];
            setNotes(updated);
            notesCacheRef.current.set(selected.id, updated);
          }}
          onNoteDeleted={noteId => {
            const updated = notes.filter(n => n.id !== noteId);
            setNotes(updated);
            notesCacheRef.current.set(selected.id, updated);
          }}
        />
      )}
    </div>
  );
}
