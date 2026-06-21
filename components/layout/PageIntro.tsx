"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lightbulb, X, HelpCircle, ArrowRight } from "lucide-react";
import { PAGE_INTROS } from "@/lib/page-intros";
import { useFeatureVideo } from "@/components/layout/FeatureVideosProvider";
import { VideoTutorialButton } from "@/components/help/VideoTutorialButton";

/**
 * Dismissible "what is this section" blurb. Copy lives in lib/page-intros.ts.
 * Dismissal is remembered per browser (localStorage), so it teaches once and
 * then gets out of the way — with a small "?" to bring it back. A "Video
 * Tutorial" button also appears here whenever an admin has set a Loom video for
 * the feature (lib/tutorials/server.ts); it shows in every state.
 */
export function PageIntro({ id }: { id: keyof typeof PAGE_INTROS }) {
  const copy = PAGE_INTROS[id];
  const video = useFeatureVideo(id);
  const videoBtn = video ? <VideoTutorialButton url={video} title={copy?.title ?? "Video Tutorial"} /> : null;
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

  // The video button is deterministic (server-provided context), so it can
  // render before mount without a hydration mismatch. Until localStorage is
  // read we show only the button so the intro state doesn't flash.
  if (!mounted || !copy) {
    return videoBtn ? <div className="mb-4">{videoBtn}</div> : null;
  }

  if (dismissed) {
    return (
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={reopen}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" /> What is this?
        </button>
        {videoBtn}
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-200">{copy.title}</p>
          <p className="text-sm text-zinc-400 leading-relaxed mt-0.5">{copy.body}</p>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {copy.guide && (
              <Link
                href={`/guide?open=${encodeURIComponent(copy.guide)}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-300/90 hover:text-amber-200 transition-colors"
              >
                Learn more in the Guide <ArrowRight className="w-3 h-3" />
              </Link>
            )}
            {videoBtn}
          </div>
        </div>
        <button onClick={dismiss} title="Got it" className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
