"use client";

import { useState } from "react";
import {
  BookOpen,
  Brain,
  ChevronDown,
  ChevronUp,
  Loader2,
  LibraryBig,
  MessageSquareText,
  Radar,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";

type BrainContextUsedResponse = {
  id: string;
  hash: string;
  capturedAt: string;
  companyKnowledge: {
    coverage: "strong" | "partial" | "weak" | "none";
    sources: Array<{
      itemId: string;
      title: string;
      excerpt: string;
      sourceUrl: string | null;
      selectionReason: string;
    }>;
  };
  businessLibrary: {
    availability: "available" | "degraded" | "unavailable" | "not_requested";
    coverage: "strong" | "partial" | "weak" | "none";
    retrievalMethod: string;
    sources: Array<{
      entryId: string;
      versionId: string;
      versionNumber: number;
      title: string;
      excerpt: string;
      category: string;
      sourceUrl: string | null;
      selectionReason: string;
    }>;
  };
  companyVoice: {
    source: string;
    channel: string | null;
    confidence: number | null;
    instructions: string[];
    hardRules: Array<Record<string, unknown>>;
    fallbackReason: string | null;
  };
  learnedPreferences: Array<{
    id: string;
    kind: string;
    content: string;
    confidence: number;
    reason: string;
  }>;
  marketContext: {
    included: boolean;
    snapshotIds: string[];
    insights: Array<{ insightId: string; kind: string; summary: string; confidence: string }>;
  };
  contextualReadiness: {
    channel: string | null;
    channelReadiness: string;
    voiceConfidence: string;
    vaultCoverage: string;
    relevantLessons: number;
    marketUpdatedAt: string | null;
  };
  warnings: Array<{
    code: string;
    message: string;
    severity: "info" | "warning" | "blocking";
  }>;
  recoverableWarnings: Array<{
    code: string;
    message: string;
    severity: "info" | "warning" | "blocking";
  }>;
};

export function BrainContextUsed({
  clientId,
  snapshotId,
}: {
  clientId: string;
  snapshotId: string | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<BrainContextUsedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshotId) return null;

  async function load() {
    if (data || loading) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<BrainContextUsedResponse>(
        `/api/brain/context-used?clientId=${clientId}&snapshotId=${snapshotId}`,
        { showErrorToast: false },
      ));
    } catch (loadError) {
      setError(errorMessage(loadError, "The Brain context could not be loaded."));
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void load();
  }

  return (
    <section className="rounded-xl border border-orange-500/25 bg-orange-500/5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Brain className="h-4 w-4 text-orange-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-orange-100">What the Brain used</p>
          <p className="text-xs text-zinc-500">
            Company facts, voice, learned preferences and market context are shown separately.
          </p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
      </button>

      {open && (
        <div className="border-t border-orange-500/15 px-4 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading immutable context…
            </div>
          )}
          {error && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <p className="text-xs text-red-300">{error}</p>
              <Button size="sm" variant="outline" onClick={() => { setData(null); void load(); }}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          )}
          {data && (
            <div className="space-y-4">
              {data.recoverableWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
                  <p className="text-xs font-semibold text-amber-300">Recoverable context notice</p>
                  <ul className="mt-1 space-y-1">
                    {data.recoverableWarnings.map((warning) => (
                      <li key={warning.code} className="text-xs leading-5 text-amber-200/80">
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <dl className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <Readiness label="Channel" value={data.contextualReadiness.channel ?? "General"} />
                <Readiness label="Readiness" value={data.contextualReadiness.channelReadiness} />
                <Readiness label="Voice" value={data.contextualReadiness.voiceConfidence.replace("_", " ")} />
                <Readiness label="Topic coverage" value={data.contextualReadiness.vaultCoverage} />
                <Readiness label="Lessons" value={String(data.contextualReadiness.relevantLessons)} />
              </dl>

              <ContextSection
                icon={BookOpen}
                title="Company knowledge"
                subtitle={`${data.companyKnowledge.coverage} topic coverage · ${data.companyKnowledge.sources.length} source${data.companyKnowledge.sources.length === 1 ? "" : "s"}`}
              >
                {data.companyKnowledge.sources.length ? (
                  <ul className="space-y-2">
                    {data.companyKnowledge.sources.map((source) => (
                      <li key={source.itemId} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                        <p className="text-xs font-medium text-zinc-200">{source.title}</p>
                        <p className="mt-1 line-clamp-3 text-xs leading-5 text-zinc-500">{source.excerpt}</p>
                        <p className="mt-1 text-xs text-zinc-600">{source.selectionReason}</p>
                      </li>
                    ))}
                  </ul>
                ) : <Empty text="No Vault source was selected for this output." />}
              </ContextSection>

              <ContextSection
                icon={LibraryBig}
                title="Business Library"
                subtitle={`${data.businessLibrary.availability.replace("_", " ")} · ${data.businessLibrary.coverage} guidance coverage · ${data.businessLibrary.sources.length} source${data.businessLibrary.sources.length === 1 ? "" : "s"}`}
              >
                {data.businessLibrary.sources.length ? (
                  <ul className="space-y-2">
                    {data.businessLibrary.sources.map((source) => (
                      <li key={`${source.versionId}:${source.title}`} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                        <p className="text-xs font-medium text-zinc-200">
                          {source.title} <span className="text-zinc-600">· v{source.versionNumber}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-orange-300/70">
                          {source.category} · General guidance, not a company fact
                        </p>
                        <p className="mt-1 line-clamp-3 text-xs leading-5 text-zinc-500">{source.excerpt}</p>
                        <p className="mt-1 text-xs text-zinc-600">{source.selectionReason}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty text={
                    data.businessLibrary.availability === "unavailable"
                      ? "Library temporarily unavailable. The answer used the remaining verified company context and can be retried."
                      : "No published Library guidance was relevant to this task."
                  } />
                )}
              </ContextSection>

              <ContextSection
                icon={MessageSquareText}
                title="Company voice"
                subtitle={`${data.companyVoice.source.replaceAll("_", " ")}${data.companyVoice.confidence === null ? "" : ` · ${data.companyVoice.confidence}% confidence`}`}
              >
                {data.companyVoice.instructions.length ? (
                  <ul className="space-y-1">
                    {data.companyVoice.instructions.map((instruction) => (
                      <li key={instruction} className="text-xs leading-5 text-zinc-400">• {instruction}</li>
                    ))}
                  </ul>
                ) : <Empty text={data.companyVoice.fallbackReason ?? "No explicit voice instructions were applied."} />}
              </ContextSection>

              <ContextSection
                icon={Sparkles}
                title="Learned preferences"
                subtitle={`${data.learnedPreferences.length} task-relevant lesson${data.learnedPreferences.length === 1 ? "" : "s"}`}
              >
                {data.learnedPreferences.length ? (
                  <ul className="space-y-2">
                    {data.learnedPreferences.map((memory) => (
                      <li key={memory.id} className="text-xs leading-5 text-zinc-400">
                        <span className="font-medium text-zinc-300">{memory.kind.replace("_", " ")}:</span>{" "}
                        {memory.content}
                        <span className="block text-xs text-zinc-600">{memory.reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : <Empty text="No approved lesson was relevant enough to include." />}
              </ContextSection>

              <ContextSection
                icon={Radar}
                title="Market context"
                subtitle={data.marketContext.included ? `${data.marketContext.insights.length} insight${data.marketContext.insights.length === 1 ? "" : "s"}` : "Not used"}
              >
                {data.marketContext.insights.length ? (
                  <ul className="space-y-2">
                    {data.marketContext.insights.map((insight) => (
                      <li key={insight.insightId} className="text-xs leading-5 text-zinc-400">
                        <span className="font-medium text-orange-200">{insight.kind.replaceAll("_", " ")}:</span>{" "}
                        {insight.summary}
                      </li>
                    ))}
                  </ul>
                ) : <Empty text="Competitor intelligence was not used as inspiration for this output." />}
              </ContextSection>

              <p className="text-xs text-zinc-700" title={data.hash}>
                Immutable context {data.id.slice(0, 8)} · captured {new Date(data.capturedAt).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Readiness({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-zinc-600">{label}</dt>
      <dd className="mt-0.5 text-xs font-medium capitalize text-zinc-300">{value}</dd>
    </div>
  );
}

function ContextSection({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Brain;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-orange-300" />
        <div>
          <h3 className="text-xs font-semibold text-zinc-200">{title}</h3>
          <p className="text-xs capitalize text-zinc-600">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-zinc-500">{text}</p>;
}
