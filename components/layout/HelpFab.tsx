import Link from "next/link";
import { BookOpen } from "lucide-react";

/**
 * Always-available shortcut to the in-app Guide. Fixed bottom-right on every
 * portal page so the best help asset is never more than one tap away (it used
 * to be buried at the bottom of the sidebar). Hidden when printing.
 */
export function HelpFab() {
  return (
    <Link
      href="/guide"
      title="Open the Guide"
      className="print:hidden fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/90 px-3 py-2 text-xs font-medium text-zinc-300 shadow-lg backdrop-blur hover:text-white hover:border-zinc-600 transition-colors"
    >
      <BookOpen className="w-4 h-4" />
      <span className="hidden sm:inline">Guide</span>
    </Link>
  );
}
