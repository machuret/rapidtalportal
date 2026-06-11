"use client";

import { useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FetchUrl } from "./FetchUrl";
import { useToolRun, ToolHeader, CopyButton, LoadingRow, CharCount, DownloadButton } from "./shared";
import { FileSearch, Loader2, Sparkles } from "lucide-react";

interface Out {
  intent: string; intentNote: string; title: string; h1: string;
  outline: { h2: string; h3s: string[] }[];
  entities: string[]; wordCount: string;
  faqs: { question: string; answer: string }[];
  gaps: string[];
  faqSchema: string | null;
}

function briefAsText(keyword: string, b: Out): string {
  return [
    `CONTENT BRIEF — ${keyword}`,
    `Intent: ${b.intent} — ${b.intentNote}`,
    `Suggested length: ${b.wordCount}`,
    `Title: ${b.title}`,
    `H1: ${b.h1}`,
    "",
    "OUTLINE:",
    ...b.outline.flatMap((o) => [`H2: ${o.h2}`, ...o.h3s.map((h) => `  H3: ${h}`)]),
    "",
    `COVER THESE: ${b.entities.join(", ")}`,
    "",
    "FAQs:",
    ...b.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`),
    "",
    "GAPS TO EXPLOIT:",
    ...b.gaps.map((g) => `- ${g}`),
  ].join("\n");
}

export function KeywordBriefTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [keyword, setKeyword] = useState("");
  const [content, setContent] = useState("");
  const { result: brief, loading, run } = useToolRun<Out>(ROUTES.tools.keywordBrief(), (initial ?? null) as Out | null);

  const go = () => run({ clientId, keyword: keyword.trim(), content: content.trim() || undefined });

  return (
    <div>
      <ToolHeader icon={FileSearch} title="Keyword Brief Generator"
        subtitle="A full content brief a writer can execute — intent, outline, entities, FAQ schema." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Target keyword</Label>
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }}
            placeholder="e.g. best time to see whales in hobart" className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <FetchUrl clientId={clientId} onFetched={setContent} />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Existing page copy <span className="text-zinc-600 font-normal">(optional — the brief will note what&apos;s missing)</span></Label>
            {content.length > 0 && <CharCount len={content.length} limit={30000} />}
          </div>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6}
            placeholder="Paste the current page content if one exists…" className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={go} disabled={loading || keyword.trim().length < 2} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Build brief
        </Button>
      </div>

      {loading && <LoadingRow message="Researching and structuring the brief…" />}

      {brief && (
        <div className="flex flex-col gap-4 mt-6">
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
            <div className="ml-auto flex items-center gap-4">
              <CopyButton label="Copy whole brief" text={briefAsText(keyword || "keyword", brief)} />
              <DownloadButton text={briefAsText(keyword || "keyword", brief)} filename="content-brief.md" />
            </div>
          </div>

          <div className="surface-card p-4">
            <p className="label-section mb-2">Title &amp; H1</p>
            <p className="text-sm text-zinc-100 font-medium">{brief.title}</p>
            <CharCount len={brief.title.length} limit={60} label="title" />
            <p className="text-sm text-zinc-300 mt-2">{brief.h1}</p>
          </div>

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

          <div className="surface-card p-4">
            <p className="label-section mb-2">Cover these topics &amp; entities</p>
            <div className="flex flex-wrap gap-1.5">
              {brief.entities.map((e, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300">{e}</span>
              ))}
            </div>
          </div>

          <div className="surface-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="label-section">FAQs (People Also Ask)</p>
              {brief.faqSchema && <CopyButton label="Copy FAQ JSON-LD" text={brief.faqSchema} className="text-cyan-400 hover:text-cyan-300" />}
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
