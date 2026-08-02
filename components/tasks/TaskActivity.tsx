"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { Loader2, Send, MessageSquare } from "lucide-react";

interface TaskEvent {
  id: string;
  kind: "comment" | "activity";
  body: string;
  who: string;
  mine: boolean;
  created_at: string;
}

/** Comments + activity trail inside the task dialog. */
export function TaskActivity({ taskId, onCommented }: { taskId: string; onCommented?: () => void }) {
  const [events, setEvents] = useState<TaskEvent[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get<{ events: TaskEvent[] }>(`${ROUTES.taskEvents()}?taskId=${taskId}`, { showErrorToast: false })
      .then((d) => { if (!cancelled) setEvents(d.events); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [taskId]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await api.post(ROUTES.taskEvents(), { taskId, body });
      setEvents((p) => [...(p ?? []), {
        id: `local-${Date.now()}`, kind: "comment", body, who: "You", mine: true,
        created_at: new Date().toISOString(),
      }]);
      setDraft("");
      onCommented?.();
    } catch { /* api-client toasts */ } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-zinc-800 pt-3 mt-1">
      <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-2">
        <MessageSquare className="w-3.5 h-3.5" /> Comments & activity
      </p>

      {events === null ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-zinc-500" /></div>
      ) : events.length === 0 ? (
        <p className="text-xs text-zinc-600 mb-2">No activity yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1 mb-2">
          {events.map((e) =>
            e.kind === "activity" ? (
              <p key={e.id} className="text-2xs text-zinc-500">
                <span className="text-zinc-400">{e.who}</span> {e.body} · {timeAgo(e.created_at)}
              </p>
            ) : (
              <div key={e.id} className={cn(
                "rounded-lg px-3 py-2 text-sm max-w-[90%]",
                e.mine ? "bg-orange-500/20 self-end" : "bg-zinc-800",
              )}>
                <p className="text-2xs text-zinc-400 mb-0.5">{e.who} · {timeAgo(e.created_at)}</p>
                <p className="text-zinc-200 whitespace-pre-wrap leading-snug">{e.body}</p>
              </div>
            ),
          )}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder="Write a comment…"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-3 h-8 text-sm text-zinc-200 placeholder:text-zinc-600"
        />
        <button
          onClick={() => void send()}
          disabled={sending || !draft.trim()}
          className="inline-flex items-center px-2.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
