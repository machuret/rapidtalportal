"use client";

import { useRef, useState } from "react";
import { cn, formatDate } from "@/lib/utils";
import type { CrmContact } from "@/app/(portal)/crm/page";
import { useContactMutations } from "@/hooks/useContacts";
import { CRM_STATUS_META, CRM_STATUSES } from "@/lib/crm-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  X, Pencil, Trash2, Save, Mail, Phone, Building2,
  CalendarDays, Tag, Loader2, Archive, ArchiveRestore, History,
} from "lucide-react";
import { useEffect } from "react";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";

type Note = { id: string; body: string; created_at: string };

interface CrmDetailPanelProps {
  contact: CrmContact;
  notes: Note[];
  loadingNotes: boolean;
  clientId: string;
  isAdmin: boolean;
  onClose: () => void;
  onUpdated: (c: CrmContact) => void;
  onDeleted: (id: string) => void;
  onNoteAdded: (note: Note) => void;
  onNoteDeleted: (id: string) => void;
}

function initials(c: CrmContact) {
  return `${c.first_name[0] ?? ""}${c.last_name?.[0] ?? ""}`.toUpperCase();
}

const EDIT_FIELDS = [
  { key: "first_name", label: "First Name" },
  { key: "last_name",  label: "Last Name" },
  { key: "email",      label: "Email" },
  { key: "phone",      label: "Phone" },
  { key: "company",    label: "Company" },
  { key: "job_title",  label: "Job Title" },
  { key: "source",     label: "Source" },
] as const;

export function CrmDetailPanel({
  contact, notes, loadingNotes, clientId, isAdmin,
  onClose, onUpdated, onDeleted, onNoteAdded, onNoteDeleted,
}: CrmDetailPanelProps) {
  const {
    updateContact, isUpdating: saving,
    deleteContact,
    createNote, isCreatingNote: savingNote,
    deleteNote: deleteNoteMutation,
  } = useContactMutations(clientId);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<CrmContact>>({});
  const savingRef = useRef(false);
  const [noteBody, setNoteBody] = useState("");
  const deletingNotesRef = useRef<Set<string>>(new Set());

  function startEdit() {
    setEditForm({ ...contact });
    setEditing(true);
  }

  async function saveEdit() {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const updated = await updateContact({
        id:         contact.id,
        clientId,
        first_name: editForm.first_name,
        last_name:  editForm.last_name  ?? null,
        email:      editForm.email      ?? null,
        phone:      editForm.phone      ?? null,
        company:    editForm.company    ?? null,
        job_title:  editForm.job_title  ?? null,
        status:     editForm.status     ?? "lead",
        source:     editForm.source     ?? null,
        notes:      editForm.notes      ?? null,
      });
      onUpdated(updated);
      setEditing(false);
      toast.success("Contact updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      savingRef.current = false;
    }
  }

  async function handleDelete() {
    if (!confirm("Permanently delete this contact and all their notes? This cannot be undone.")) return;
    try {
      await deleteContact({ id: contact.id, clientId });
      onDeleted(contact.id);
      toast.success("Contact deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function handleArchive(archive: boolean) {
    try {
      const updated = await updateContact({ id: contact.id, clientId, archived: archive });
      onUpdated(updated);
      toast.success(archive ? "Contact archived — recoverable from the Archived view." : "Contact restored.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    }
  }

  // Activity trail — who created / moved / edited / archived this contact.
  const [events, setEvents] = useState<{ id: string; body: string; who: string; created_at: string }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    api.get<{ events: { id: string; body: string; who: string; created_at: string }[] }>(
      `${ROUTES.crm.events()}?contactId=${contact.id}`, { showErrorToast: false },
    )
      .then((d) => { if (!cancelled) setEvents(d.events); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [contact.id]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteBody.trim() || savingNote) return;
    try {
      const note = await createNote({ contactId: contact.id, clientId, body: noteBody.trim() });
      onNoteAdded(note);
      setNoteBody("");
      toast.success("Note saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save note.");
    }
  }

  async function deleteNote(noteId: string) {
    if (deletingNotesRef.current.has(noteId)) return;
    deletingNotesRef.current.add(noteId);
    try {
      await deleteNoteMutation({ id: noteId, clientId });
      onNoteDeleted(noteId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete note.");
    } finally {
      deletingNotesRef.current.delete(noteId);
    }
  }

  const sm = CRM_STATUS_META[contact.status];

  return (
    <div className="w-96 shrink-0 flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden sticky top-4 self-start max-h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-900/80">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-200 shrink-0">
              {initials(contact)}
            </div>
            <div>
              <p className="font-bold text-zinc-100">{contact.first_name} {contact.last_name}</p>
              <p className="text-xs text-zinc-500">
                {contact.job_title ?? ""}{contact.job_title && contact.company ? " · " : ""}{contact.company ?? ""}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!contact.archived_at && (
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:text-white h-7 text-xs gap-1" onClick={startEdit}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
          {contact.archived_at ? (
            <Button size="sm" variant="outline" className="border-zinc-700 text-green-400 hover:text-green-300 h-7 text-xs gap-1" onClick={() => handleArchive(false)}>
              <ArchiveRestore className="w-3.5 h-3.5" /> Restore
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 h-7 text-xs gap-1" onClick={() => handleArchive(true)}>
              <Archive className="w-3.5 h-3.5" /> Archive
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 text-xs gap-1" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {editing ? (
          <div className="px-5 py-4 flex flex-col gap-3 border-b border-zinc-800">
            <p className="label-section mb-1">Edit Contact</p>
            {EDIT_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <Label className="text-zinc-400 text-xs">{label}</Label>
                <Input
                  value={(editForm[key as keyof CrmContact] as string) ?? ""}
                  onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm"
                />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <Label className="text-zinc-400 text-xs">Status</Label>
              <select
                value={editForm.status ?? "lead"}
                onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                className="h-8 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {CRM_STATUSES.map(s => <option key={s} value={s}>{CRM_STATUS_META[s].label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-zinc-400 text-xs">Notes</Label>
              <Textarea
                value={(editForm.notes as string) ?? ""}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit} disabled={saving} className="gap-1.5 flex-1">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="text-zinc-400">Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-4 flex flex-col gap-4 border-b border-zinc-800">
            <div className="flex flex-col gap-2">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm text-zinc-300 hover:text-blue-400 transition-colors group">
                  <Mail className="w-4 h-4 text-zinc-600 group-hover:text-blue-400 shrink-0" />{contact.email}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-sm text-zinc-300 hover:text-green-400 transition-colors group">
                  <Phone className="w-4 h-4 text-zinc-600 group-hover:text-green-400 shrink-0" />{contact.phone}
                </a>
              )}
              {contact.company && (
                <span className="flex items-center gap-2 text-sm text-zinc-400">
                  <Building2 className="w-4 h-4 text-zinc-600 shrink-0" />{contact.company}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs px-3 py-1 rounded-full border font-medium", sm?.cls)}>
                {sm?.label}
              </span>
              {contact.source && (
                <span className="text-xs text-zinc-500 bg-zinc-800 border border-zinc-700 px-3 py-1 rounded-full">
                  via {contact.source}
                </span>
              )}
            </div>
            {contact.tags?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Tag className="w-3.5 h-3.5 text-zinc-600 mt-0.5 shrink-0" />
                {contact.tags.map(t => (
                  <span key={t} className="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-1 text-xs text-zinc-600">
              <span className="flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5" />
                Added {formatDate(contact.created_at, { day: "numeric", month: "long", year: "numeric" })}
              </span>
              {contact.notes && (
                <div className="mt-2 rounded-lg bg-zinc-800/60 border border-zinc-700 px-3 py-2">
                  <p className="text-xs text-zinc-500 font-medium mb-1">Internal notes</p>
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{contact.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Activity notes */}
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="label-section">Activity Notes</p>
          <form onSubmit={addNote} className="flex flex-col gap-2">
            <Textarea
              value={noteBody}
              onChange={e => setNoteBody(e.target.value)}
              placeholder="Add a note or activity log…"
              rows={2}
              className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm resize-none placeholder:text-zinc-600"
            />
            <Button type="submit" size="sm" disabled={!noteBody.trim() || savingNote} className="self-end h-7 text-xs gap-1">
              {savingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Save Note
            </Button>
          </form>

          {loadingNotes ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading notes…
            </div>
          ) : notes.length === 0 ? (
            <p className="text-xs text-zinc-600 py-2">No notes yet — add your first above.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {notes.map(n => (
                <div key={n.id} className="rounded-lg bg-zinc-800 border border-zinc-700/50 px-3 py-2.5 group relative">
                  <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed pr-6">{n.body}</p>
                  <p className="text-xs text-zinc-600 mt-1.5">
                    {new Date(n.created_at).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <button
                    onClick={() => deleteNote(n.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity trail — who created / moved / edited / archived this contact */}
        <div className="px-5 py-4 border-t border-zinc-800">
          <p className="flex items-center gap-1.5 label-section mb-2">
            <History className="w-3.5 h-3.5" /> Activity
          </p>
          {events === null ? (
            <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-zinc-500" /></div>
          ) : events.length === 0 ? (
            <p className="text-xs text-zinc-600">No recorded activity yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {events.map((e) => (
                <p key={e.id} className="text-[11px] text-zinc-500 leading-relaxed">
                  <span className="text-zinc-400">{e.who}</span> {e.body} ·{" "}
                  {new Date(e.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
