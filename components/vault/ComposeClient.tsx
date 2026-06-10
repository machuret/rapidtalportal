"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Wand2, Loader2, Copy, Check, RefreshCw, Reply } from "lucide-react";

interface AskResponse {
  answer: string;
  sources: { n: number; kind: string; kindLabel: string; title: string; itemId: string | null }[];
}

const TYPES = ["Email", "Client message", "Reply", "Social post", "Other"] as const;
type DraftType = (typeof TYPES)[number];

function buildInstruction(type: DraftType, task: string, company: string) {
  const noun = type === "Other" ? "message" : type.toLowerCase();
  return `You are drafting a ${noun} on behalf of ${company}.
Task: ${task}

Write a polished, ready-to-send ${noun} in ${company}'s voice and tone, using our real services, details, and policies from the company knowledge. Plain text only — no markdown. If a specific detail (a name, date, or price) isn't in our knowledge, leave a clear [placeholder] instead of inventing it. Output only the draft itself.`;
}

function buildReplyInstruction(inbound: string, guidance: string, company: string) {
  return `A customer or contact sent ${company} this message:
"""
${inbound}
"""
${guidance ? `Extra guidance for the reply: ${guidance}\n` : ""}
Draft a helpful, professional reply on behalf of ${company}, in our voice and tone. Address their specific questions and requests using our real services, details, and policies from the company knowledge. Plain text only — no markdown. If a specific detail isn't in our knowledge, leave a clear [placeholder] instead of inventing it. Output only the reply.`;
}

export function ComposeClient({ clientId, companyName }: { clientId: string; companyName: string }) {
  const [mode, setMode] = useState<"new" | "reply">("new");
  const [type, setType] = useState<DraftType>("Email");
  const [task, setTask] = useState("");
  const [inbound, setInbound] = useState("");
  const [guidance, setGuidance] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [sources, setSources] = useState<AskResponse["sources"]>([]);
  const [history, setHistory] = useState<{ question: string; answer: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [refine, setRefine] = useState("");
  const [copied, setCopied] = useState(false);

  async function run(question: string, asRefine: boolean) {
    setLoading(true);
    try {
      const res = await api.post<AskResponse>(ROUTES.vault.ask(), {
        clientId,
        question,
        mode: "deep",
        history: asRefine ? history : [],
      });
      setDraft(res.answer);
      setSources(res.sources ?? []);
      setHistory((prev) => (asRefine ? [...prev, { question, answer: res.answer }] : [{ question, answer: res.answer }]));
      setCopied(false);
    } catch {
      // api-client surfaces a toast
    } finally {
      setLoading(false);
    }
  }

  function compose() {
    if (loading) return;
    if (mode === "new") {
      if (task.trim().length < 5) return;
      run(buildInstruction(type, task.trim(), companyName), false);
    } else {
      if (inbound.trim().length < 5) return;
      run(buildReplyInstruction(inbound.trim(), guidance.trim(), companyName), false);
    }
  }

  function doRefine() {
    if (refine.trim().length < 2 || loading) return;
    run(`Refine the draft based on this instruction, keeping it ready to send: ${refine.trim()}`, true);
    setRefine("");
  }

  async function copy() {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    toast.success("Copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Wand2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Compose</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Describe what you need — the brain drafts it in {companyName}&apos;s voice, ready to review and send.
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1.5 mb-4">
        <button
          onClick={() => setMode("new")}
          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
            mode === "new" ? "bg-zinc-700 text-white border-zinc-700" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200")}
        >
          <Wand2 className="w-3.5 h-3.5" /> New draft
        </button>
        <button
          onClick={() => setMode("reply")}
          className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
            mode === "reply" ? "bg-zinc-700 text-white border-zinc-700" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200")}
        >
          <Reply className="w-3.5 h-3.5" /> Reply to a message
        </button>
      </div>

      {mode === "new" ? (
        <>
          {/* Type */}
          <div className="flex gap-1.5 flex-wrap mb-3">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                  type === t
                    ? "bg-zinc-700 text-white border-zinc-700"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <Textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={3}
            placeholder="e.g. Draft a friendly confirmation email for a customer who just booked the A Strait Day tour for 2 people next Saturday."
            className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 mb-3"
          />
          <Button onClick={compose} disabled={loading || task.trim().length < 5} className="gap-1.5">
            {loading && !draft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            Draft it
          </Button>
        </>
      ) : (
        <>
          <label className="label-section mb-1.5 block">Paste the message you received</label>
          <Textarea
            value={inbound}
            onChange={(e) => setInbound(e.target.value)}
            rows={6}
            placeholder="Paste the customer's email or message here…"
            className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 mb-3"
          />
          <Input
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            placeholder="Optional: how to handle it — e.g. offer the 2-day tour, be apologetic, confirm availability…"
            className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 mb-3"
          />
          <Button onClick={compose} disabled={loading || inbound.trim().length < 5} className="gap-1.5">
            {loading && !draft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Reply className="w-4 h-4" />}
            Draft reply
          </Button>
        </>
      )}

      {/* Draft output */}
      {draft && (
        <div className="surface-card p-5 mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="label-section">Draft</p>
            <button onClick={copy} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap">
            {draft}
            {loading && <span className="ml-0.5 animate-pulse">▍</span>}
          </p>

          {/* Refine */}
          <div className="mt-4 pt-3 border-t border-zinc-800 flex gap-2">
            <Input
              value={refine}
              onChange={(e) => setRefine(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doRefine(); }}
              placeholder="Refine — e.g. make it warmer, shorter, add the cancellation policy…"
              disabled={loading}
              className="bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 h-9 text-sm"
            />
            <Button onClick={doRefine} disabled={loading || refine.trim().length < 2} variant="outline" size="sm" className="border-zinc-700 gap-1.5">
              {loading && draft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refine
            </Button>
          </div>

          {sources.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {sources.map((s) => (
                <span key={s.n} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400" title={s.kindLabel}>
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500">{s.kindLabel}</span>
                  <span className="truncate max-w-[14rem]">{s.title}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
