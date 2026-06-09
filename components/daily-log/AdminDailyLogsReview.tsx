"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle, Clock, ChevronDown, ChevronUp, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useSubmitDailyLogFeedback } from "@/hooks/useDailyLog";
import type { Mood } from "./DailyLogStudio";

interface LogWithUser {
  id: string;
  log_date: string;
  user_id: string;
  mood: Mood | null;
  tasks_done: string;
  positives: string;
  challenges: string;
  goals_achieved: string;
  goals_tomorrow: string;
  admin_feedback: string | null;
  reviewed_at: string | null;
  users: { full_name: string | null; email: string } | null;
}

const MOOD_PILLS: Record<Mood, string> = {
  great:       "bg-green-500/20 text-green-400",
  good:        "bg-blue-500/20 text-blue-400",
  neutral:     "bg-yellow-500/20 text-yellow-400",
  difficult:   "bg-orange-500/20 text-orange-400",
  overwhelmed: "bg-red-500/20 text-red-400",
};

const MOOD_EMOJI: Record<Mood, string> = {
  great: "🟢", good: "🔵", neutral: "🟡", difficult: "🟠", overwhelmed: "🔴",
};

function Section({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-zinc-500 mb-1">{label}</p>
      <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}

function LogRow({ log, onFeedbackSaved }: { log: LogWithUser; onFeedbackSaved: (id: string, feedback: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState(log.admin_feedback ?? "");
  const feedbackMutation = useSubmitDailyLogFeedback();
  const saving = feedbackMutation.isPending;
  const isReviewed = !!log.reviewed_at;
  const vaName = log.users?.full_name ?? log.users?.email ?? "Unknown VA";

  async function submitFeedback() {
    if (!feedback.trim()) return;
    try {
      await feedbackMutation.mutateAsync({ log_id: log.id, feedback: feedback.trim() });
      toast.success("Feedback sent.");
      onFeedbackSaved(log.id, feedback.trim());
    } catch {
      toast.error("Failed to save feedback.");
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <button
        className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-zinc-800/50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 grid grid-cols-3 gap-4 items-center">
          <div>
            <p className="text-sm font-medium">{vaName}</p>
            <p className="text-xs text-zinc-500">{format(parseISO(log.log_date), "EEEE, MMM d")}</p>
          </div>
          <div>
            {log.mood ? (
              <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${MOOD_PILLS[log.mood]}`}>
                {MOOD_EMOJI[log.mood]} {log.mood.charAt(0).toUpperCase() + log.mood.slice(1)}
              </span>
            ) : (
              <span className="text-xs text-zinc-600">No mood</span>
            )}
          </div>
          <div className="flex items-center gap-2 justify-end">
            {isReviewed ? (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle className="w-3.5 h-3.5" /> Reviewed
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <Clock className="w-3.5 h-3.5" /> Pending
              </span>
            )}
            {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 px-5 py-4 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Section label="✅ Tasks Done"        value={log.tasks_done} />
            <Section label="🌟 Positives"         value={log.positives} />
            <Section label="🚧 Challenges"        value={log.challenges} />
            <Section label="🎯 Goals Achieved"    value={log.goals_achieved} />
            <Section label="📅 Goals Tomorrow"    value={log.goals_tomorrow} />
          </div>

          <div className="border-t border-zinc-800 pt-4">
            <p className="text-xs font-semibold text-zinc-400 mb-2">💬 Your Feedback</p>
            <Textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="Leave feedback for this VA…"
              rows={3}
              className="bg-zinc-800 border-zinc-700 text-sm resize-none mb-3"
            />
            <Button size="sm" onClick={submitFeedback} disabled={saving || !feedback.trim()} className="text-xs h-8">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
              {isReviewed ? "Update Feedback" : "Send Feedback"}
            </Button>
            {log.reviewed_at && (
              <p className="text-xs text-zinc-600 mt-2">
                Last reviewed {format(parseISO(log.reviewed_at), "MMM d 'at' h:mm a")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminDailyLogsReview({ logs }: { logs: LogWithUser[] }) {
  const [items, setItems] = useState(logs);

  function handleFeedbackSaved(id: string, feedback: string) {
    setItems(prev => prev.map(l => l.id === id ? { ...l, admin_feedback: feedback, reviewed_at: new Date().toISOString() } : l));
  }

  const pending  = items.filter(l => !l.reviewed_at).length;
  const reviewed = items.filter(l => l.reviewed_at).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">VA Daily Logs</h1>
        <p className="text-zinc-400 text-sm mt-0.5">Last 30 days — review and leave feedback</p>
      </div>

      <div className="flex gap-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <p className="text-2xl font-bold text-amber-400">{pending}</p>
          <p className="text-xs text-zinc-500">Pending Review</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <p className="text-2xl font-bold text-green-400">{reviewed}</p>
          <p className="text-xs text-zinc-500">Reviewed</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <p>No daily logs in the last 30 days.</p>
          <p className="text-sm mt-1">Your VAs haven&apos;t submitted logs yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(log => (
            <LogRow key={log.id} log={log} onFeedbackSaved={handleFeedbackSaved} />
          ))}
        </div>
      )}
    </div>
  );
}
