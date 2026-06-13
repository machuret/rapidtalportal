"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/report-client-error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isMissingEnv = error.message?.includes("Missing NEXT_PUBLIC_SUPABASE");

  useEffect(() => {
    console.error("Global error:", error);
    // A misconfigured env isn't worth a report (the endpoint is likely down
    // too); genuine crashes are recorded for /admin/errors.
    if (!isMissingEnv) reportClientError(error);
  }, [error, isMissingEnv]);

  return (
    <html>
      <body className="bg-zinc-950 text-white min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center px-6">
          <p className="text-4xl mb-4">⚠️</p>
          <h1 className="text-xl font-bold mb-2">
            {isMissingEnv ? "Configuration Error" : "Something went wrong"}
          </h1>
          <p className="text-zinc-400 text-sm mb-6">
            {isMissingEnv
              ? "Supabase environment variables are not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your hosting provider."
              : error.message || "An unexpected server error occurred."}
          </p>
          {error.digest && (
            <p className="text-zinc-600 text-xs mb-4">Digest: {error.digest}</p>
          )}
          <Button onClick={reset}>Try again</Button>
        </div>
      </body>
    </html>
  );
}
