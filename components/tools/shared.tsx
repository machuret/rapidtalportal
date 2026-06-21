"use client";

/**
 * Shared building blocks for tool components. Every tool is: header → input
 * card → run → result renderer. These pieces own the repetitive 80% so each
 * tool file is just its unique form + renderer (and tool #13 is a 30-minute
 * job, not a copy-paste of 150 lines).
 */
import { useState, type ComponentType } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { BrainFeedback } from "@/components/brain/BrainFeedback";
import { Loader2, Copy, Check, Download } from "lucide-react";

/**
 * Run a tool endpoint: loading state, result, error toast — one hook.
 *
 * Also returns a ready `feedback` node (👍/👎 → brain_signals, surface "tool")
 * so every tool feeds the same learning loop as the rest of the product. The
 * client_id is captured from the run payload (all tools pass it), so wiring a
 * tool up is just rendering `{feedback}` below its result.
 */
export function useToolRun<T>(endpoint: string, initial?: T | null) {
  const [result, setResult] = useState<T | null>(initial ?? null);
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  async function run(payload: Record<string, unknown>) {
    if (loading) return;
    if (typeof payload.clientId === "string") setClientId(payload.clientId);
    setLoading(true);
    setResult(null);
    try {
      setResult(await api.post<T>(endpoint, payload, { showErrorToast: false }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Whole-result rating (one signal per generation, consistent across all
  // tools). The artifact carries every variant, so a 👎 + reason can be specific.
  const artifactText = result ? (typeof result === "string" ? result : JSON.stringify(result)) : "";
  const feedback = result && clientId && artifactText
    ? (
      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs text-zinc-500">Was this useful?</span>
        <BrainFeedback clientId={clientId} surface="tool" artifactText={artifactText} context={{ tool: endpoint }} />
      </div>
    )
    : null;

  return { result, setResult, loading, run, feedback };
}

const TINTS: Record<string, string> = {
  cyan: "from-cyan-500 to-blue-600 shadow-cyan-500/20",
  pink: "from-pink-500 to-rose-600 shadow-pink-500/20",
};

export function ToolHeader({ icon: Icon, title, subtitle, tint = "cyan" }: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  tint?: "cyan" | "pink";
}) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg", TINTS[tint])}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">{title}</h1>
        <p className="text-zinc-400 text-sm mt-1">{subtitle}</p>
      </div>
    </div>
  );
}

/** Self-contained copy button with its own confirmation state. */
export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={copy} className={cn("inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors", className)}>
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : label}
    </button>
  );
}

export function LoadingRow({ message }: { message: string }) {
  // role=status + aria-live so screen readers announce that work is in progress.
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center py-12 text-sm text-zinc-500">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> {message}
    </div>
  );
}

/** Download arbitrary text as a file (e.g. a brief or repurposed pack as .md/.txt). */
export function DownloadButton({ text, filename, label = "Download", className }: { text: string; filename: string; label?: string; className?: string }) {
  function download() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button onClick={download} className={cn("inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors", className)}>
      <Download className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

/** Wraps a tool's result so assistive tech announces when output is ready. */
export function ResultRegion({ children }: { children: React.ReactNode }) {
  return (
    <div role="region" aria-label="Result" aria-live="polite" className="mt-6">
      {children}
    </div>
  );
}

/** Char counter that goes red over the limit. */
export function CharCount({ len, limit, label }: { len: number; limit: number; label?: string }) {
  return (
    <p className={cn("text-2xs", len > limit ? "text-red-400" : "text-zinc-500")}>
      {len}/{limit}{label ? ` ${label}` : ""}
    </p>
  );
}
