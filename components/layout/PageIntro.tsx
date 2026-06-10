"use client";

import { useEffect, useState } from "react";
import { Lightbulb, X, HelpCircle } from "lucide-react";
import { PAGE_INTROS } from "@/lib/page-intros";

/**
 * Dismissible "what is this section" blurb. Copy lives in lib/page-intros.ts.
 * Dismissal is remembered per browser (localStorage), so it teaches once and
 * then gets out of the way — with a small "?" to bring it back.
 */
export function PageIntro({ id }: { id: keyof typeof PAGE_INTROS }) {
  const copy = PAGE_INTROS[id];
  const key = `intro-dismissed:${id}`;
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    try { setDismissed(localStorage.getItem(key) === "1"); } catch { /* ignore */ }
  }, [key]);

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(key, "1"); } catch { /* ignore */ }
  }
  function reopen() {
    setDismissed(false);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }

  // Avoid a hydration flash: render nothing until we've checked localStorage.
  if (!mounted || !copy) return null;

  if (dismissed) {
    return (
      <button
        onClick={reopen}
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-4"
      >
        <HelpCircle className="w-3.5 h-3.5" /> What is this?
      </button>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 mb-6">
      <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200">{copy.title}</p>
        <p className="text-sm text-zinc-400 leading-relaxed mt-0.5">{copy.body}</p>
      </div>
      <button onClick={dismiss} title="Got it" className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
