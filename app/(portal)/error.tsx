"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { reportClientError } from "@/lib/report-client-error";
import { reportClientExperience, retryClientNavigation } from "@/lib/client-experience";
import { cn } from "@/lib/utils";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Portal error:", error);
    reportClientError(error);
    reportClientExperience({
      eventType: "page_error",
      path: window.location.pathname,
      metadata: { hasReference: Boolean(error.digest) },
    });
  }, [error]);

  function retry() {
    retryClientNavigation(window.location.pathname);
    reportClientExperience({ eventType: "page_retry", path: window.location.pathname, metadata: { from: "error" } });
    reset();
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-2xl border border-amber-500/20 bg-zinc-900/80 p-7 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-bold mb-2">We couldn&apos;t load this page</h1>
        <p className="mx-auto mb-4 max-w-md text-sm text-zinc-400">
          Your previously saved work is still available. Try loading the page again, or return to the Dashboard and continue somewhere else.
        </p>
        {error.digest && (
          <p className="mb-5 text-xs text-zinc-500">Reference: {error.digest}</p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={retry} variant="outline" className="border-zinc-700">
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
          <Link href="/dashboard" className={cn(buttonVariants({ variant: "ghost" }))}>
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
