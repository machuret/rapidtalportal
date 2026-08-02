import { Brain, MessageSquareText } from "lucide-react";

export default function CoachLoading() {
  return (
    <div className="page-prose" role="status" aria-label="Loading RapidTal Coach">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-orange-300">
          <Brain className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">RapidTal Coach</span>
        </div>
        <div className="mt-3 h-8 w-64 animate-pulse rounded-lg bg-zinc-800" />
        <div className="mt-2 h-4 w-full max-w-xl animate-pulse rounded bg-zinc-800/70" />
      </div>

      <section className="surface-card overflow-hidden" aria-hidden="true">
        <div className="flex min-h-[28rem] flex-col items-center justify-center px-6 text-center">
          <span className="rounded-2xl bg-orange-500/10 p-4 text-orange-300">
            <MessageSquareText className="h-7 w-7 animate-pulse" />
          </span>
          <p className="mt-4 text-sm font-medium text-zinc-300">Preparing your private Coach workspace…</p>
          <p className="mt-1 text-xs text-zinc-500">Loading your conversations, permitted work and company context.</p>
          <div className="mt-6 h-11 w-full max-w-2xl animate-pulse rounded-xl bg-zinc-800/80" />
        </div>
      </section>
      <span className="sr-only">Loading RapidTal Coach…</span>
    </div>
  );
}
