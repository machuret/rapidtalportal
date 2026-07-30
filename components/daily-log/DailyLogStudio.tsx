"use client";

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { format, subDays, parseISO, isFuture } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Trash2, BarChart2, Loader2, Check } from "lucide-react";
import { DailyLogHistory } from "./DailyLogHistory";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { toast } from "sonner";
import {
  useDailyLogQuery,
  useUpsertDailyLog,
  useAddDailyLogNote,
  useDeleteDailyLogNote,
  dailyLogKeys,
} from "@/hooks/useDailyLog";
import { useQueryClient } from "@tanstack/react-query";
import type { Mood, DailyLog, DailyLogNote } from "@/types/daily-log";

export type { Mood, DailyLog, DailyLogNote } from "@/types/daily-log";

interface HistoryEntry { log_date: string; mood: Mood | null; }

interface Props {
  initialLog:     DailyLog | null;
  initialNotes:   DailyLogNote[];
  initialHistory: HistoryEntry[];
  /** Server-computed 'today' (yyyy-MM-dd). Passed in (not derived from
   *  `new Date()` at render) so SSR and the client hydrate identically — the
   *  server renders in UTC and the browser in the user's tz, which otherwise
   *  triggers React hydration mismatches (#418/#422/#425) near a day boundary. */
  today:          string;
  readOnly?:      boolean;
  viewingUserId?: string; // When set (admin viewing a VA), date nav fetches this user's log
}

const MOODS: { value: Mood; label: string; emoji: string; color: string; dot: string }[] = [
  { value: "great",       label: "Great",       emoji: "🟢", color: "bg-green-500/20 text-green-400 border-green-500/40",   dot: "bg-green-400"  },
  { value: "good",        label: "Good",        emoji: "🔵", color: "bg-blue-500/20 text-blue-400 border-blue-500/40",      dot: "bg-blue-400"   },
  { value: "neutral",     label: "Neutral",     emoji: "🟡", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40", dot: "bg-yellow-400" },
  { value: "difficult",   label: "Difficult",   emoji: "🟠", color: "bg-orange-500/20 text-orange-400 border-orange-500/40", dot: "bg-orange-400" },
  { value: "overwhelmed", label: "Overwhelmed", emoji: "🔴", color: "bg-red-500/20 text-red-400 border-red-500/40",          dot: "bg-red-400"    },
];

const SECTIONS = [
  { key: "tasks_done",     label: "✅ Tasks Done",         placeholder: "List what you completed today…" },
  { key: "positives",      label: "🌟 Positives / Wins",   placeholder: "What went well? Any wins?" },
  { key: "challenges",     label: "🚧 Challenges",         placeholder: "What got in the way? Any blockers?" },
  { key: "goals_achieved", label: "🎯 Goals Achieved",     placeholder: "Which goals did you hit today?" },
  { key: "goals_tomorrow", label: "📅 Goals for Tomorrow", placeholder: "What are your top priorities tomorrow?" },
] as const;

export function DailyLogStudio({ initialLog, initialNotes, initialHistory, today, readOnly = false, viewingUserId }: Props) {
  const [activeDate, setActiveDate] = useState(today);
  const isActiveToday = activeDate === today;
  const isReadOnly = readOnly || !isActiveToday;

  const queryClient = useQueryClient();

  // React Query drives date navigation. For today, server-provided initialData
  // seeds the cache so the initial render needs no fetch.
  const dayQuery = useDailyLogQuery(activeDate, viewingUserId, {
    initialData: isActiveToday ? { log: initialLog, notes: initialNotes } : undefined,
  });

  const upsertMutation = useUpsertDailyLog();
  const addNoteMutation = useAddDailyLogNote();
  const deleteNoteMutation = useDeleteDailyLogNote();

  // Local editable copies — the structured form is autosaved via debounce, so we
  // keep working state locally and sync from the query when the date changes.
  const [log, setLog] = useState<DailyLog | null>(initialLog);
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory);
  const [notes, setNotes] = useState<DailyLogNote[]>(initialNotes);
  const [saved, setSaved] = useState(false);
  const [noteText, setNoteText] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // useRef holds latest form values to avoid stale closure in debounced save
  const logRef = useRef<DailyLog | null>(initialLog);
  // Tracks the date whose query data we've synced into local state, so edits to
  // the active day aren't clobbered by background refetches.
  const syncedDateRef = useRef(today);
  // Track which fields changed since last save — only send dirty fields
  const dirtyFields = useRef<Set<string>>(new Set());
  // In-flight delete guard — prevents double-delete on rapid click
  const deletingNotes = useRef<Set<string>>(new Set());

  const saving = upsertMutation.isPending;
  const loadingDate = !isActiveToday && dayQuery.isFetching && syncedDateRef.current !== activeDate;

  // Sync query data into local editable state when a new date's data arrives.
  useEffect(() => {
    if (!dayQuery.data) return;
    if (syncedDateRef.current === activeDate) return;
    syncedDateRef.current = activeDate;
    logRef.current = dayQuery.data.log;
    setLog(dayQuery.data.log);
    setNotes(dayQuery.data.notes ?? []);
  }, [dayQuery.data, activeDate]);

  function debouncedSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flushSave(), 800);
  }

  async function flushSave() {
    const dirty = Array.from(dirtyFields.current);
    if (!dirty.length) return;
    const current = logRef.current;
    // Build payload: only log_date (required) + dirty fields
    const payload: Record<string, string | Mood | null> = { log_date: today };
    for (const key of dirty) {
      payload[key] = (current as Record<string, string | Mood | null> | null)?.[key] ?? (key === "mood" ? null : "");
    }
    dirtyFields.current.clear();
    try {
      const updated = await upsertMutation.mutateAsync(payload as { log_date: string; [key: string]: string | Mood | null });
      setLog(updated);
      logRef.current = updated;
      // Keep the today query cache in sync with the saved log.
      queryClient.setQueryData(dailyLogKeys.byDate(today, viewingUserId), {
        log: updated,
        notes,
      });
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
      setHistory(prev => {
        const exists = prev.find(h => h.log_date === today);
        if (exists) return prev.map(h => h.log_date === today ? { ...h, mood: updated.mood } : h);
        return [...prev, { log_date: today, mood: updated.mood }];
      });
    } catch {
      toast.error("Failed to save. Try again.");
    }
  }

  const handleChange = useCallback((key: string, value: string) => {
    setLog(prev => {
      const next = prev
        ? { ...prev, [key]: value }
        : { id: "", log_date: today, tasks_done: "", positives: "", challenges: "", goals_achieved: "", goals_tomorrow: "", mood: null, admin_feedback: null, reviewed_at: null, [key]: value } as DailyLog;
      logRef.current = next;
      return next;
    });
    dirtyFields.current.add(key);
    debouncedSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const handleMood = useCallback((mood: Mood) => {
    if (isReadOnly) return;
    setLog(prev => {
      const next = prev ? { ...prev, mood } : null;
      logRef.current = next;
      return next;
    });
    dirtyFields.current.add("mood");
    debouncedSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadOnly]);

  const addingNote = addNoteMutation.isPending;

  async function addNote() {
    if (!noteText.trim() || !log?.id) return;
    try {
      const note = await addNoteMutation.mutateAsync({ log_id: log.id, body: noteText.trim() });
      setNotes(prev => [note, ...prev]);
      setNoteText("");
    } catch {
      toast.error("Failed to add note.");
    }
  }

  async function deleteNote(id: string) {
    if (deletingNotes.current.has(id)) return;
    deletingNotes.current.add(id);
    try {
      await deleteNoteMutation.mutateAsync(id);
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch {
      toast.error("Failed to delete note.");
    } finally {
      deletingNotes.current.delete(id);
    }
  }

  function loadDate(date: string) {
    if (date === activeDate) return;
    if (isFuture(parseISO(date))) return;
    // Switching activeDate re-keys the query (date in queryKey); the sync effect
    // copies the fetched log/notes into local state once data arrives. When an
    // admin views a VA's log, viewingUserId is part of the query key so the API
    // returns the correct log instead of defaulting to the admin's own.
    setActiveDate(date);
  }

  const historyMap = useMemo(
    () => new Map(history.map(h => [h.log_date, h])),
    [history]
  );

  const last30 = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => {
      // Derive from the server `today` (not new Date()) so the strip is
      // deterministic between SSR and hydration.
      const d = format(subDays(parseISO(today), 29 - i), "yyyy-MM-dd");
      const h = historyMap.get(d);
      return { date: d, mood: h?.mood ?? null, hasEntry: !!h };
    }),
    [historyMap, today]
  );

  const activeMood = useMemo(
    () => MOODS.find(m => m.value === log?.mood),
    [log?.mood]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Log</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            {isActiveToday ? "Today — " : ""}{format(parseISO(activeDate), "EEEE, MMMM d, yyyy")}
            {isReadOnly && <span className="ml-2 text-xs text-zinc-600">(read-only)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
          {saved && <span className="text-xs text-green-400 flex items-center gap-1"><Check className="w-3 h-3" />Saved</span>}
          <Link href="/daily-log/analytics">
            <Button variant="outline" size="sm" className="border-zinc-700 text-xs">
              <BarChart2 className="w-3.5 h-3.5 mr-1.5" />Analytics
            </Button>
          </Link>
          <Button
            variant="outline" size="sm"
            aria-label="Previous day"
            className="border-zinc-700 text-xs"
            onClick={() => loadDate(format(subDays(parseISO(activeDate), 1), "yyyy-MM-dd"))}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline" size="sm"
            aria-label="Next day"
            className="border-zinc-700 text-xs"
            onClick={() => loadDate(today)}
            disabled={isActiveToday}
          >
            Today
          </Button>
          <Button
            variant="outline" size="sm"
            className="border-zinc-700 text-xs"
            onClick={() => loadDate(format(subDays(parseISO(activeDate), -1), "yyyy-MM-dd"))}
            disabled={isActiveToday}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {loadingDate && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      {/* Mood selector */}
      <div className="flex gap-2 flex-wrap">
        {MOODS.map(m => (
          <button
            key={m.value}
            onClick={() => handleMood(m.value)}
            disabled={isReadOnly}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
              log?.mood === m.value ? m.color + " ring-1 ring-offset-1 ring-offset-zinc-950" : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600"
            } ${isReadOnly ? "cursor-default opacity-60" : "cursor-pointer"}`}
          >
            {m.emoji} {m.label}
          </button>
        ))}
        {activeMood && (
          <span className={`ml-auto text-xs px-2 py-1 rounded-full border ${activeMood.color}`}>
            Feeling {activeMood.label}
          </span>
        )}
      </div>

      {/* Admin feedback (read-only display) */}
      {log?.admin_feedback && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
          <p className="text-xs font-semibold text-amber-400 mb-1.5">💬 Admin Feedback</p>
          <p className="text-sm text-zinc-300 whitespace-pre-wrap">{log.admin_feedback}</p>
          {log.reviewed_at && (
            <p className="text-xs text-zinc-600 mt-2">
              Reviewed {format(parseISO(log.reviewed_at), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </div>
      )}

      {/* Main 2-col layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left — structured form */}
        <div className="flex flex-col gap-4">
          {SECTIONS.map(s => (
            <div key={s.key} className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-300">{s.label}</label>
              <Textarea
                value={(log as Record<string, string> | null)?.[s.key] ?? ""}
                onChange={e => handleChange(s.key, e.target.value)}
                placeholder={s.placeholder}
                disabled={isReadOnly}
                rows={3}
                className="bg-zinc-900 border-zinc-800 text-sm resize-none focus:border-zinc-600 disabled:opacity-50"
              />
            </div>
          ))}
        </div>

        {/* Right — quick notes */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-zinc-300">⚡ Quick Notes</p>

          {!isReadOnly && (
            <div className="flex gap-2">
              <Textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }}
                placeholder="Quick note… (Enter to add)"
                rows={2}
                className="flex-1 bg-zinc-900 border-zinc-800 text-sm resize-none"
              />
              <Button
                onClick={addNote}
                aria-label="Add quick note"
                disabled={!noteText.trim() || !log?.id || addingNote}
                size="sm"
                className="self-end h-8"
              >
                {addingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              </Button>
            </div>
          )}

          {!log?.id && !isReadOnly && (
            <p className="text-xs text-zinc-500">Save your summary first to enable quick notes.</p>
          )}

          <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto">
            {notes.length === 0 ? (
              <p className="text-zinc-500 text-sm py-4 text-center">No notes yet{isReadOnly ? " for this day." : " — add one above."}</p>
            ) : notes.map(n => (
              <div key={n.id} className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5 flex gap-2 items-start group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-snug">{n.body}</p>
                  <p className="text-xs text-zinc-500 mt-1">{format(parseISO(n.created_at), "h:mm a")}</p>
                </div>
                {!isReadOnly && (
                  <button
                    onClick={() => deleteNote(n.id)}
                    aria-label="Delete quick note"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-red-400 shrink-0 mt-0.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 30-day history strip */}
      <DailyLogHistory
        days={last30}
        activeDate={activeDate}
        onDateClick={loadDate}
      />
    </div>
  );
}
