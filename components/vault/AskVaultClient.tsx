"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Send, Loader2, Sparkles } from "lucide-react";

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

const SUGGESTIONS = [
  "What services do we offer?",
  "How do I onboard a new client?",
  "What's our refund policy?",
  "Who do I contact about billing?",
];

export function AskVaultClient({ clientId, companyName }: { clientId: string; companyName: string }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 3 || loading) return;
    setQuestion("");
    setLoading(true);
    try {
      const res = await api.post<AskResponse>(ROUTES.vault.ask(), { clientId, question: trimmed });
      setTurns((prev) => [...prev, { question: trimmed, answer: res.answer, sources: res.sources ?? [] }]);
    } catch {
      // api-client already surfaces a toast on failure.
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(question);
  }

  return (
    <div className="max-w-3xl flex flex-col min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Brain className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Ask the Vault</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Ask anything about {companyName} — answers come straight from your Vault, with sources.
          </p>
        </div>
      </div>

      {/* Conversation / empty state */}
      <div className="flex-1 space-y-6 mb-4">
        {turns.length === 0 && !loading && (
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
          <div key={i} className="space-y-3">
            {/* Question */}
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 text-white px-4 py-2.5 text-sm">
                {t.question}
              </div>
            </div>
            {/* Answer */}
            <div className="surface-card p-4">
              <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{t.answer}</p>
              {t.sources.length > 0 && (
                <div className="mt-4 pt-3 border-t border-zinc-800">
                  <p className="label-section mb-2">Sources</p>
                  <div className="flex flex-wrap gap-1.5">
                    {t.sources.map((s) => (
                      <span
                        key={s.n}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300"
                        title={s.kindLabel}
                      >
                        <span className="text-zinc-500 font-mono">[{s.n}]</span>
                        <span className="text-[10px] uppercase tracking-wide text-zinc-500">{s.kindLabel}</span>
                        <span className="truncate max-w-[12rem] text-zinc-300">{s.title}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="surface-card p-4 flex items-center gap-2 text-zinc-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Searching the Vault…
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
