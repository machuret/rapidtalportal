"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Send, Loader2, Sparkles, ChevronDown, ThumbsUp, ThumbsDown, BookmarkPlus, Check, GraduationCap } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface Source {
  n: number;
  kind: "dna" | "vault" | "kb" | "sop";
  kindLabel: string;
  title: string;
  itemId: string | null;
}

interface AskResponse {
  answer: string;
  sources: Source[];
  chunksUsed: number;
  tokensUsed?: number;
}

interface Turn {
  question: string;
  answer: string;
  sources: Source[];
}

type HistoryItem = { question: string; answer: string };

const SUGGESTIONS = [
  "What services do we offer?",
  "How do I onboard a new client?",
  "What's our refund policy?",
  "Who do I contact about billing?",
];

/**
 * Stream an answer from /api/vault/ask-stream (SSE). Calls onProgress with the
 * growing answer. Returns { ok:false } on any failure so the caller can fall
 * back to the non-streaming endpoint — streaming is pure upside, never a break.
 */
async function askStream(
  clientId: string,
  question: string,
  history: HistoryItem[],
  onProgress: (answer: string, sources: Source[]) => void,
  mode?: "deep",
): Promise<{ ok: boolean; answer: string; sources: Source[] }> {
  let answer = "";
  let sources: Source[] = [];
  try {
    const res = await fetch("/api/vault/ask-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, question, history, ...(mode ? { mode } : {}) }),
    });
    if (!res.ok || !res.body) return { ok: false, answer: "", sources: [] };

    const sh = res.headers.get("X-Vault-Sources");
    if (sh) {
      try { sources = JSON.parse(decodeURIComponent(escape(atob(sh)))); } catch { /* ignore */ }
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith("data:")) continue;
        const d = l.slice(5).trim();
        if (d === "[DONE]") continue;
        try {
          const delta = JSON.parse(d)?.choices?.[0]?.delta?.content;
          if (delta) { answer += delta; onProgress(answer, sources); }
        } catch { /* partial JSON line; ignore */ }
      }
    }
    return { ok: answer.length > 0, answer, sources };
  } catch {
    return { ok: false, answer: "", sources: [] };
  }
}

export function AskVaultClient({
  clientId,
  companyName,
  canCurate,
  externalAsk,
}: {
  clientId: string;
  companyName: string;
  canCurate: boolean;
  /** Lets a parent (e.g. golden questions panel) submit a question into this chat. */
  externalAsk?: { q: string; nonce: number } | null;
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [interim, setInterim] = useState<Turn | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, interim]);

  // A parent panel (golden questions) can push a question into the chat.
  useEffect(() => {
    if (externalAsk?.q) void ask(externalAsk.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalAsk?.nonce]);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 3 || loading) return;
    setQuestion("");
    setLoading(true);
    const history: HistoryItem[] = turns.slice(-4).map((t) => ({ question: t.question, answer: t.answer }));
    setInterim({ question: trimmed, answer: "", sources: [] });

    // Stream first; fall back to the non-streaming endpoint if anything fails.
    const r = await askStream(clientId, trimmed, history, (answer, sources) =>
      setInterim({ question: trimmed, answer, sources }),
    );
    if (r.ok) {
      setTurns((prev) => [...prev, { question: trimmed, answer: r.answer, sources: r.sources }]);
    } else {
      try {
        const res = await api.post<AskResponse>(ROUTES.vault.ask(), { clientId, question: trimmed, history });
        setTurns((prev) => [...prev, { question: trimmed, answer: res.answer, sources: res.sources ?? [] }]);
      } catch {
        // api-client already surfaces a toast on failure.
      }
    }
    setInterim(null);
    setLoading(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(question);
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Brain className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Ask the Vault</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Ask anything about {companyName} — answers come straight from your company brain.
          </p>
        </div>
      </div>

      {/* Conversation / empty state */}
      <div className="flex-1 space-y-6 mb-4">
        {turns.length === 0 && !interim && (
          <div className="surface-card p-8 text-center">
            <Sparkles className="w-7 h-7 text-purple-400 mx-auto mb-3" />
            <p className="text-zinc-300 font-medium mb-1">What would you like to know?</p>
            <p className="text-zinc-500 text-sm mb-5">
              I answer only from documents in your Vault, and cite where each fact came from.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <ChatTurn
            key={i}
            turn={t}
            clientId={clientId}
            canCurate={canCurate}
            history={turns.slice(Math.max(0, i - 4), i).map((p) => ({ question: p.question, answer: p.answer }))}
          />
        ))}

        {interim && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-orange-500 text-zinc-950 px-4 py-2.5 text-sm">
                {interim.question}
              </div>
            </div>
            <div className="surface-card p-4">
              {interim.answer ? (
                <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {interim.answer}
                  <span className="ml-0.5 animate-pulse">▍</span>
                </p>
              ) : (
                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching the brain…
                </div>
              )}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <form onSubmit={onSubmit} className="sticky bottom-0 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent pt-3 pb-2">
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about your company…"
            disabled={loading}
            className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
          <Button type="submit" disabled={loading || question.trim().length < 3} className="gap-1.5 shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Ask
          </Button>
        </div>
      </form>
    </div>
  );
}

/** One Q&A exchange — clean answer by default, with optional "Go deeper" + sources. */
function ChatTurn({
  turn, clientId, history, canCurate,
}: { turn: Turn; clientId: string; history: HistoryItem[]; canCurate: boolean }) {
  const [showSources, setShowSources] = useState(false);
  const [deepAnswer, setDeepAnswer] = useState<string | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [rated, setRated] = useState<1 | -1 | null>(null);
  const [saved, setSaved] = useState(false);
  const [teaching, setTeaching] = useState(false);
  const [teachText, setTeachText] = useState("");
  const [teachBusy, setTeachBusy] = useState(false);
  const [taught, setTaught] = useState(false);

  const unanswered = turn.sources.length === 0;

  async function teach() {
    if (teachText.trim().length < 3 || teachBusy) return;
    setTeachBusy(true);
    try {
      await api.post(ROUTES.vault.teach(), {
        clientId, question: turn.question, answer: teachText.trim(),
      });
      setTaught(true);
      setTeaching(false);
      toast.success("Thanks — the brain learned it. Next person who asks gets your answer.");
    } catch {
      // api-client surfaces a toast
    } finally {
      setTeachBusy(false);
    }
  }

  async function goDeeper() {
    if (deepLoading || deepAnswer) return;
    setDeepLoading(true);
    // Stream the deep answer so the long (gpt-4o) generation shows progress as it
    // arrives; fall back to the non-streaming endpoint if streaming fails.
    const r = await askStream(clientId, turn.question, history, (a) => setDeepAnswer(a), "deep");
    if (!r.ok) {
      try {
        const res = await api.post<AskResponse>(ROUTES.vault.ask(), {
          clientId,
          question: turn.question,
          mode: "deep",
          history,
        });
        setDeepAnswer(res.answer);
      } catch {
        // api-client surfaces a toast
      }
    }
    setDeepLoading(false);
  }

  async function rate(r: 1 | -1) {
    if (rated) return;
    setRated(r);
    try {
      await api.post(ROUTES.vault.feedback(), {
        clientId,
        question: turn.question,
        answer: deepAnswer ?? turn.answer,
        rating: r,
        sources: turn.sources.map((s) => ({ kind: s.kind, title: s.title, itemId: s.itemId })),
      }, { showErrorToast: false });
      toast.success("Thanks for the feedback.");
    } catch {
      setRated(null);
    }
  }

  async function saveToKb() {
    if (saved) return;
    try {
      await api.post(ROUTES.vault.promoteKb(), {
        clientId, question: turn.question, answer: deepAnswer ?? turn.answer,
      });
      setSaved(true);
      toast.success("Saved to the Knowledge Base.");
    } catch {
      // api-client surfaces a toast
    }
  }

  return (
    <div className="space-y-3">
      {/* Question */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-orange-500 text-zinc-950 px-4 py-2.5 text-sm">
          {turn.question}
        </div>
      </div>

      {/* Answer */}
      <div className="surface-card p-4">
        <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{turn.answer}</p>

        {deepAnswer && (
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <p className="label-section mb-1.5">More detail</p>
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {deepAnswer}
              {deepLoading && <span className="ml-0.5 animate-pulse">▍</span>}
            </p>
          </div>
        )}

        {/* Teach the brain — capture knowledge at the moment a gap is found */}
        {unanswered && !taught && (
          <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            {!teaching ? (
              <button
                onClick={() => setTeaching(true)}
                className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                <GraduationCap className="w-3.5 h-3.5" />
                Know the answer? Teach the brain
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-zinc-400">
                  Type the answer — it&apos;s saved to the Knowledge Base and the next person who asks gets it.
                </p>
                <Textarea
                  value={teachText}
                  onChange={(e) => setTeachText(e.target.value)}
                  rows={3}
                  placeholder="The answer is…"
                  className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={teach} disabled={teachBusy || teachText.trim().length < 3} className="gap-1.5 h-7 text-xs">
                    {teachBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <GraduationCap className="w-3 h-3" />}
                    Teach it
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setTeaching(false)} className="h-7 text-xs border-zinc-700">
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {taught && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-green-400">
            <Check className="w-3.5 h-3.5" /> Learned — saved to the Knowledge Base.
          </p>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center gap-4 flex-wrap">
          {!deepAnswer && !unanswered && (
            <button
              onClick={goDeeper}
              disabled={deepLoading}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
            >
              {deepLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {deepLoading ? "Thinking…" : "Go deeper"}
            </button>
          )}
          {turn.sources.length > 0 && (
            <button
              onClick={() => setShowSources((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showSources && "rotate-180")} />
              {showSources ? "Hide sources" : `Sources (${turn.sources.length})`}
            </button>
          )}

          {/* Feedback */}
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => rate(1)}
              disabled={rated !== null}
              title="Good answer"
              className={cn("p-1 rounded transition-colors disabled:cursor-default",
                rated === 1 ? "text-green-400" : "text-zinc-500 hover:text-green-400 disabled:hover:text-zinc-500")}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => rate(-1)}
              disabled={rated !== null}
              title="Needs work"
              className={cn("p-1 rounded transition-colors disabled:cursor-default",
                rated === -1 ? "text-red-400" : "text-zinc-500 hover:text-red-400 disabled:hover:text-zinc-500")}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
            {canCurate && (
              <button
                onClick={saveToKb}
                disabled={saved}
                title="Save this answer to the Knowledge Base"
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-blue-400 transition-colors disabled:text-green-400 ml-1"
              >
                {saved ? <Check className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                {saved ? "Saved" : "Save to KB"}
              </button>
            )}
          </div>
        </div>

        {showSources && turn.sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {turn.sources.map((s) => (
              <span
                key={s.n}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300"
                title={s.kindLabel}
              >
                <span className="text-3xs uppercase tracking-wide text-zinc-500">{s.kindLabel}</span>
                <span className="truncate max-w-[14rem] text-zinc-300">{s.title}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
