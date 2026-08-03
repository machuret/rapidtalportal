"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, Sparkles } from "lucide-react";
import { ContextualCoachPanel } from "@/components/coach/ContextualCoachPanel";
import type { CoachRole } from "@/components/coach/useCoachChat";
import { coachPageContextForPath } from "@/supabase/functions/_shared/coach-page-context";
import { reportClientExperience } from "@/lib/client-experience";
import { clientDestinationForPath } from "@/lib/client-navigation";

/** In-place contextual Coach. It receives only a controlled workspace key;
 * URL parameters and page-entered text never become hidden prompt context. */
export function HelpFab({
  clientId = null,
  coachRole = "client",
}: {
  clientId?: string | null;
  coachRole?: CoachRole;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pageContext = coachPageContextForPath(pathname);
  const guideTitle = clientDestinationForPath(pathname)?.guideTitle ?? "Home";

  if (!clientId || !pageContext) {
    return (
      <Link href="/guide" title="Open the Guide" aria-label="Open the Guide" className="print:hidden fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/90 px-3 py-2 text-xs font-medium text-zinc-300 shadow-lg backdrop-blur hover:border-zinc-600 hover:text-white">
        <CircleHelp className="h-4 w-4" /><span className="hidden sm:inline">Help</span>
      </Link>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={`Ask Coach about ${pageContext.context.label}`}
        aria-label={`Ask Coach about ${pageContext.context.label}`}
        onClick={() => {
          reportClientExperience({ eventType: "contextual_help_opened", path: pathname, metadata: { source: "floating_help" } });
          setOpen(true);
        }}
        className="print:hidden fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-zinc-900/95 px-3 py-2 text-xs font-medium text-purple-200 shadow-lg backdrop-blur transition-colors hover:border-purple-400/60 hover:text-white"
      >
        <Sparkles className="h-4 w-4" /><span className="hidden sm:inline">Help here</span>
      </button>
      {open && (
        <ContextualCoachPanel
          key={pageContext.key}
          clientId={clientId}
          coachRole={coachRole}
          contextKey={pageContext.key}
          guideTitle={guideTitle}
          onClose={() => {
            setOpen(false);
            window.requestAnimationFrame(() => triggerRef.current?.focus());
          }}
        />
      )}
    </>
  );
}
