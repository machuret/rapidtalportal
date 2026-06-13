"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/report-client-error";

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
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <p className="text-3xl mb-4">⚠️</p>
      <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
      <p className="text-zinc-400 text-sm mb-2 max-w-sm">{error.message || "An unexpected error occurred."}</p>
      {error.digest && (
        <p className="text-zinc-600 text-xs mb-4">Digest: {error.digest}</p>
      )}
      <Button onClick={reset} variant="outline" className="border-zinc-700">
        Try again
      </Button>
    </div>
  );
}
