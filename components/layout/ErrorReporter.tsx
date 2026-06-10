"use client";

import { useEffect, useRef } from "react";

/**
 * Reports uncaught browser errors and unhandled promise rejections to
 * /api/errors so they show up at /admin/errors. Throttled hard client-side
 * (max 5 per page load) and deduped, so one render loop can't spam.
 */
export function ErrorReporter() {
  const sent = useRef(new Set<string>());

  useEffect(() => {
    const report = (message: string, stack?: string) => {
      const key = message.slice(0, 200);
      if (sent.current.has(key) || sent.current.size >= 5) return;
      sent.current.add(key);
      void fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, stack, url: window.location.pathname }),
      }).catch(() => {});
    };

    const onError = (e: ErrorEvent) => report(e.message || "Unknown error", e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      report(
        reason instanceof Error ? `Unhandled rejection: ${reason.message}` : `Unhandled rejection: ${String(reason)}`,
        reason instanceof Error ? reason.stack : undefined,
      );
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
