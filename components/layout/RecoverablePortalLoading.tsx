"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Clock3, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clientLoadingCopy, reportClientExperience } from "@/lib/client-experience";

const SLOW_AFTER_MS = 3_000;
const DELAYED_AFTER_MS = 10_000;

export function RecoverablePortalLoading({ feature }: { feature?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [elapsed, setElapsed] = useState<"normal" | "slow" | "delayed">("normal");
  const copy = clientLoadingCopy(pathname);
  const label = feature ?? copy.label;

  useEffect(() => {
    const startedAt = Date.now();
    const slowTimer = window.setTimeout(() => {
      setElapsed("slow");
      reportClientExperience({ eventType: "page_slow", path: pathname, durationMs: Date.now() - startedAt });
    }, SLOW_AFTER_MS);
    const delayedTimer = window.setTimeout(() => setElapsed("delayed"), DELAYED_AFTER_MS);
    return () => {
      window.clearTimeout(slowTimer);
      window.clearTimeout(delayedTimer);
    };
  }, [pathname]);

  function retry() {
    reportClientExperience({ eventType: "page_retry", path: pathname });
    setElapsed("normal");
    router.refresh();
  }

  return (
    <div className="space-y-6" role="status" aria-label={`Loading ${label}`} aria-live="polite">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-orange-500/10 p-2 text-orange-300">
            {elapsed === "normal" ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Clock3 className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-zinc-100">
              {elapsed === "normal" ? `Loading your ${label}…` : elapsed === "slow" ? "This is taking longer than expected" : "The service may be delayed"}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {elapsed === "normal" ? copy.detail : elapsed === "slow" ? `We are still preparing your ${label}. You can wait, retry, or return to the dashboard.` : `Your ${label} has not loaded yet. Retrying this page will not create duplicate work.`}
            </p>
            {elapsed !== "normal" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={retry} className="border-zinc-700">
                  <RefreshCw className="mr-2 h-4 w-4" /> Try again
                </Button>
                <Link href="/dashboard" className={cn(buttonVariants({ variant: "ghost" }))}>
                  Return to Dashboard
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="animate-pulse space-y-5" aria-hidden="true">
        <div className="h-8 w-48 rounded-lg bg-zinc-800" />
        <div className="h-4 w-72 max-w-full rounded bg-zinc-800/60" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, index) => <div key={index} className="h-20 rounded-xl bg-zinc-800" />)}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="h-72 rounded-xl bg-zinc-800" />
          <div className="h-72 rounded-xl bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}
