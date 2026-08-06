"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { Button } from "@/components/ui/button";
import { Markdown } from "./Markdown";
import { formatDate } from "@/lib/utils";
import { Telescope, Loader2, RefreshCw, Sparkles, Info, AlertTriangle } from "lucide-react";
import { errorMessage } from "@/lib/error-message";

interface Analysis {
  content: string;
  model: string | null;
  source_url: string | null;
  updated_at: string;
}

export function VaultExpanded({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);
  // Abort the in-flight deep-analysis stream if the user navigates away, so a
  // frontier-model generation doesn't keep billing (and setting state) after unmount.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<{ analysis: Analysis | null }>(`${ROUTES.vault.expand()}?clientId=${clientId}`, { showErrorToast: false })
      .then((d) => {
        if (!cancelled) {
          setAnalysis(d.analysis);
          setLoadError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAnalysis(null);
          setLoadError(errorMessage(error, "The expanded Vault analysis could not be loaded."));
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId, loadNonce]);

  // Non-streaming fallback used if the stream fails to start.
  async function generateNonStreaming() {
    const { analysis: a } = await api.post<{ analysis: Analysis }>(
      ROUTES.vault.expand(), { clientId }, { showErrorToast: false },
    );
    setAnalysis(a);
  }

  async function generate() {
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setStreamingContent("");
    try {
      // Stream the analysis as it's written; the server persists it in the
      // background. Falls back to the non-streaming endpoint on any failure.
      const res = await fetch("/api/vault/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, stream: true }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error("stream-unavailable");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = ""; let acc = "";
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
            if (delta) { acc += delta; setStreamingContent(acc); }
          } catch { /* partial SSE line */ }
        }
      }

      if (acc.trim()) {
        // Display the streamed text immediately; the authoritative stored record
        // (with source_url etc.) loads via GET on the next visit.
        setAnalysis({ content: acc, model: res.headers.get("X-Expand-Model"), source_url: null, updated_at: new Date().toISOString() });
        toast.success("Deep analysis ready.");
      } else {
        await generateNonStreaming();
        toast.success("Deep analysis ready.");
      }
    } catch {
      // User navigated away mid-stream — stop, don't retry or toast on a dead component.
      if (controller.signal.aborted) return;
      try {
        await generateNonStreaming();
        toast.success("Deep analysis ready.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't generate the analysis.");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted) {
        setStreamingContent("");
        setGenerating(false);
      }
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>;
  }
  if (loadError) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-10 text-center">
        <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-red-300" />
        <p className="font-medium text-red-200">Expanded View unavailable</p>
        <p className="mt-1 text-sm text-red-300/80">{loadError}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLoadNonce((value) => value + 1)}
          className="mt-4 gap-1.5 border-red-400/40"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const generatingState = (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Loader2 className="w-6 h-6 animate-spin text-violet-400 mb-3" />
      <p className="text-sm text-zinc-300 font-medium">Analyzing the whole corpus…</p>
      <p className="text-xs text-zinc-500 mt-1">A frontier model is reading the dossier, catalog, and every page. ~30 seconds.</p>
    </div>
  );

  // While generating: show the streamed text as it arrives, or the spinner
  // until the first token lands.
  const liveView = streamingContent ? (
    <div className="surface-card rounded-xl p-5">
      <Markdown content={streamingContent} />
      <span className="ml-0.5 animate-pulse">▍</span>
    </div>
  ) : generatingState;

  if (!analysis) {
    return (
      <div>
        {generating ? liveView : (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/15 flex items-center justify-center mx-auto mb-4">
              <Telescope className="w-6 h-6 text-violet-400" />
            </div>
            <p className="text-zinc-200 font-semibold text-lg">Expanded View</p>
            <p className="text-zinc-500 text-sm mt-1 max-w-md mx-auto">
              A deeper, strategic read of this company — industry context, positioning, brand voice,
              audience, competitive landscape, and opportunities. Generated by a frontier model over
              everything we&apos;ve crawled.
            </p>
            {canWrite ? (
              <Button onClick={generate} className="gap-1.5 mt-5">
                <Sparkles className="w-4 h-4" /> Generate deep analysis
              </Button>
            ) : (
              <p className="text-xs text-zinc-600 mt-5">No analysis yet — ask an admin to generate it.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Telescope className="w-4 h-4 text-violet-400" />
        <h2 className="text-sm font-semibold text-violet-300 uppercase tracking-wide">Expanded View</h2>
        <span className="text-xs text-zinc-600">
          {analysis.model} · {formatDate(analysis.updated_at, { day: "numeric", month: "short", year: "numeric" })}
        </span>
        {canWrite && (
          <Button size="sm" variant="outline" onClick={generate} disabled={generating} className="ml-auto gap-1.5 border-zinc-700 h-8 text-xs">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Regenerate
          </Button>
        )}
      </div>

      <div className="flex items-start gap-2 mb-5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <Info className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
        <p className="text-xs text-zinc-500">
          Strategic interpretation, not verified fact — industry and competitive points are informed analysis.
          This is for your team to read; RapidTal Coach still answers only from grounded company context.
        </p>
      </div>

      {generating ? liveView : <div className="surface-card rounded-xl p-5"><Markdown content={analysis.content} /></div>}
    </div>
  );
}
