/**
 * Fire-and-forget reporter for errors caught by React error boundaries
 * (error.tsx / global-error.tsx). Server-rendered crashes only reach the
 * browser as a digest + message; without this they would never land in
 * app_errors / /admin/errors. Posts to the same authenticated, rate-limited
 * endpoint window-error reports use. Never throws; failures are swallowed so a
 * reporting hiccup can't escalate the original error.
 */
export function reportClientError(error: Error & { digest?: string }): void {
  try {
    const body = JSON.stringify({
      message: (error.digest ? `[digest ${error.digest}] ` : "") + (error.message || "Render error"),
      stack: error.stack?.slice(0, 8000),
      url: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
    // keepalive lets the report survive an immediate navigation/retry.
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let reporting cause an error */
  }
}
