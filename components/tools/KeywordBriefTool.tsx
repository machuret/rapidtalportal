"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileSearch, Loader2, Sparkles, Copy, Check, Code2 } from "lucide-react";
import { FetchUrl } from "./FetchUrl";

interface Brief {
  intent: string; intentNote: string; title: string; h1: string;
  outline: { h2: string; h3s: string[] }[];
  entities: string[]; wordCount: string;
  faqs: { question: string; answer: string }[];
  gaps: string[];
  faqSchema: string | null;
}

export function KeywordBriefTool({ clientId }: { clientId: string }) {
  const [keyword, setKeyword] = useState("");
  const [content, setContent] = useState("");
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function run() {
    if (keyword.trim().length < 2 || loading) return;
    setLoading(true);
    setBrief(null);
    try {
      const r = await api.post<Brief>(ROUTES.tools.keywordBrief(),
        { clientId, keyword: keyword.trim(), content: content.trim() || undefined }, { showErrorToast: false });
      setBrief(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the brief.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  function copyWholeBrief() {
    if (!brief) return;
    const text = [
      `CONTENT BRIEF — ${keyword}`,
      `Intent: ${brief.intent} — ${brief.intentNote}`,
      `Suggested length: ${brief.wordCount}`,
      `Title: ${brief.title}`,
      `H1: ${brief.h1}`,
      "",
      "OUTLINE:",
      ...brief.outline.flatMap((o) => [`H2: ${o.h2}`, ...o.h3s.map((h) => `  H3: ${h}`)]),
      "",
      `COVER THESE: ${brief.entities.join(", ")}`,
      "",
      "FAQs:",
      ...brief.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`),
      "",
      "GAPS TO EXPLOIT:",
      ...brief.gaps.map((g) => `- ${g}`),
    ].join("\n");
    void copy("brief", text);
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <FileSearch className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Keyword Brief Generator</h1>
          <p className="text-zinc-400 text-sm mt-1">A full content brief a writer can execute — intent, outline, entities, FAQ schema.</p>
        </div>
      </div>

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Target keyword</Label>
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
            placeholder="e.g. best time to see whales in hobart" className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <FetchUrl clientId={clientId} onFetched={setContent} />
        <div className="flex flex-col gap-1.5">
          <Label>Existing page copy <span className="text-zinc-600 font-normal">(optional — the brief will note what&apos;s missing)</span></Label>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6}
            placeholder="Paste the current page content if one exists…" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={run} disabled={loading || keyword.trim().length < 2} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Build brief
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Researching and structuring the brief…
        </div>
      )}

      {brief && (
        <div className="flex flex-col gap-4 mt-6">
          {/* Summary row */}
          <div className="surface-card p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <p className="label-section">Intent</p>
              <p className="text-sm text-zinc-100 font-medium capitalize">{brief.intent}</p>
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="label-section">What the searcher wants</p>
              <p className="text-sm text-zinc-300">{brief.intentNote}</p>
            </div>
            <div>
              <p className="label-section">Length</p>
              <p className="text-sm text-zinc-100 font-medium">{brief.wordCount}</p>
            </div>
            <button onClick={copyWholeBrief} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white ml-auto">
              {copied === "brief" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy whole brief
            </button>
          </div>

          {/* Title + H1 */}
          <div className="surface-card p-4">
            <p className="label-section mb-2">Title &amp; H1</p>
            <p className="text-sm text-zinc-100 font-medium">{brief.title}</p>
            <p className="text-[11px] text-zinc-500 mb-2">{brief.title.length}/60 title</p>
            <p className="text-sm text-zinc-300">{brief.h1}</p>
          </div>

          {/* Outline */}
          <div className="surface-card p-4">
            <p className="label-section mb-3">Heading outline</p>
            <div className="flex flex-col gap-3">
              {brief.outline.map((o, i) => (
                <div key={i}>
                  <p className="text-sm font-semibold text-zinc-100">H2 · {o.h2}</p>
                  {o.h3s.length > 0 && (
                    <ul className="mt-1 pl-4 flex flex-col gap-0.5">
                      {o.h3s.map((h, j) => <li key={j} className="text-sm text-zinc-400">H3 · {h}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Entities */}
          <div className="surface-card p-4">
            <p className="label-section mb-2">Cover these topics &amp; entities</p>
            <div className="flex flex-wrap gap-1.5">
              {brief.entities.map((e, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300">{e}</span>
              ))}
            </div>
          </div>

          {/* FAQs + schema */}
          <div className="surface-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="label-section">FAQs (People Also Ask)</p>
              {brief.faqSchema && (
                <button onClick={() => copy("schema", brief.faqSchema!)} className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300">
                  {copied === "schema" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Code2 className="w-3.5 h-3.5" />} Copy FAQ JSON-LD
                </button>
              )}
            </div>
            <div className="flex flex-col gap-3">
              {brief.faqs.map((f, i) => (
                <div key={i}>
                  <p className="text-sm font-medium text-zinc-100">{f.question}</p>
                  <p className="text-sm text-zinc-400 mt-0.5">{f.answer}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Gaps */}
          {brief.gaps.length > 0 && (
            <div className="surface-card p-4">
              <p className="label-section mb-2">Gaps competitors miss</p>
              <ul className="list-disc pl-5 flex flex-col gap-1">
                {brief.gaps.map((g, i) => <li key={i} className="text-sm text-zinc-300">{g}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
