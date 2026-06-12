"use client";

import { useState } from "react";
import { ROUTES } from "@/lib/api/routes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FetchUrl } from "./FetchUrl";
import { useToolRun, ToolHeader, LoadingRow, CharCount, CopyButton, DownloadButton } from "./shared";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ClipboardCheck, Loader2, Sparkles, AlertTriangle, Link2, Zap } from "lucide-react";

interface Out {
  overall: number;
  subscores: { depth: number; keyword: number; readability: number; structure: number };
  issues: { severity: "high" | "medium" | "low"; issue: string; fix: string }[];
  internalLinks: string[];
  quickWins: string[];
}

const SUB_LABELS: { key: keyof Out["subscores"]; label: string }[] = [
  { key: "depth", label: "Content depth" },
  { key: "keyword", label: "Keyword usage" },
  { key: "readability", label: "Readability" },
  { key: "structure", label: "Structure" },
];

const SEV: Record<string, string> = {
  high: "text-red-300 bg-red-500/10 border-red-500/25",
  medium: "text-amber-300 bg-amber-500/10 border-amber-500/25",
  low: "text-zinc-300 bg-zinc-800 border-zinc-700",
};

const scoreColor = (n: number) => (n >= 75 ? "text-green-400" : n >= 50 ? "text-amber-400" : "text-red-400");
const barColor = (n: number) => (n >= 75 ? "bg-green-500" : n >= 50 ? "bg-amber-500" : "bg-red-500");

function auditAsText(a: Out): string {
  return [
    `CONTENT AUDIT — overall ${a.overall}/100`,
    ...SUB_LABELS.map(({ key, label }) => `  ${label}: ${a.subscores[key]}`),
    "",
    "ISSUES:",
    ...a.issues.map((i) => `- [${i.severity}] ${i.issue}\n  Fix: ${i.fix}`),
    "",
    "QUICK WINS:",
    ...a.quickWins.map((w) => `- ${w}`),
    "",
    "INTERNAL LINK IDEAS:",
    ...a.internalLinks.map((l) => `- ${l}`),
  ].join("\n");
}

export function ContentAuditorTool({ clientId, initial }: { clientId: string; initial?: unknown }) {
  const [content, setContent] = useState("");
  const [keyword, setKeyword] = useState("");
  const { result: audit, loading, run } = useToolRun<Out>(ROUTES.tools.contentAuditor(), (initial ?? null) as Out | null);

  return (
    <div>
      <ToolHeader icon={ClipboardCheck} title="Content Auditor"
        subtitle="Paste existing page copy — get an honest scored audit with exact fixes." />

      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Target keyword <span className="text-zinc-600 font-normal">(optional)</span></Label>
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. boat tours hobart"
            className="bg-zinc-800 border-zinc-700 text-zinc-100" />
        </div>
        <FetchUrl clientId={clientId} onFetched={setContent} />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Page copy</Label>
            <CharCount len={content.length} limit={30000} />
          </div>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10}
            placeholder="Paste the full page content here (at least a few paragraphs)…"
            className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm" />
        </div>
        <Button onClick={() => run({ clientId, content: content.trim(), keyword: keyword.trim() || undefined })}
          disabled={loading || content.trim().length < 100} className="gap-2 self-start">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Audit it
        </Button>
      </div>

      {loading && <LoadingRow message="Auditing the copy…" />}

      {audit && (
        <div className="flex flex-col gap-4 mt-6">
          <div className="flex items-center justify-end gap-4">
            <CopyButton text={auditAsText(audit)} label="Copy audit" />
            <DownloadButton text={auditAsText(audit)} filename="content-audit.md" />
          </div>
          <div className="surface-card p-5 flex flex-col sm:flex-row gap-6">
            <div className="text-center sm:w-36 shrink-0">
              <p className={cn("text-5xl font-bold tabular", scoreColor(audit.overall))}>{audit.overall}</p>
              <p className="text-xs text-zinc-500 mt-1">overall / 100</p>
            </div>
            <div className="flex-1 flex flex-col gap-2.5">
              {SUB_LABELS.map(({ key, label }) => {
                const v = audit.subscores[key];
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-400">{label}</span>
                      <span className={cn("text-xs font-semibold tabular", scoreColor(v))}>{v}</span>
                    </div>
                    <ProgressBar value={v} trackClassName="h-1.5 w-full" barClassName={barColor(v)} />
                  </div>
                );
              })}
            </div>
          </div>

          {audit.issues.length > 0 && (
            <div className="surface-card p-4">
              <p className="label-section mb-3">Issues, by severity</p>
              <div className="flex flex-col gap-3">
                {audit.issues.map((i, idx) => (
                  <div key={idx} className={cn("rounded-lg border px-3 py-2.5", SEV[i.severity])}>
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {i.issue}
                    </p>
                    <p className="text-sm opacity-80 mt-1 pl-5">Fix: {i.fix}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {audit.quickWins.length > 0 && (
              <div className="surface-card p-4">
                <p className="label-section mb-2 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-amber-400" /> Quick wins</p>
                <ul className="list-disc pl-5 flex flex-col gap-1">
                  {audit.quickWins.map((w, i) => <li key={i} className="text-sm text-zinc-300">{w}</li>)}
                </ul>
              </div>
            )}
            {audit.internalLinks.length > 0 && (
              <div className="surface-card p-4">
                <p className="label-section mb-2 flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5 text-cyan-400" /> Internal link ideas</p>
                <ul className="list-disc pl-5 flex flex-col gap-1">
                  {audit.internalLinks.map((l, i) => <li key={i} className="text-sm text-zinc-300">{l}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
