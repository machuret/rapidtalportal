"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleHelp, Loader2, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";

type ProviderState = "working" | "unknown" | "unavailable";
type ProviderStatus = {
  id: string;
  label: string;
  state: ProviderState;
  checkedAt: string | null;
  diagnostic: string | null;
};

export function ProviderStatusStrip({ clientId }: { clientId: string }) {
  const [result, setResult] = useState<{ configured: boolean; unavailable: boolean; providers: ProviderStatus[] } | null>(null);

  useEffect(() => {
    let active = true;
    void api.get<{ configured: boolean; unavailable: boolean; providers: ProviderStatus[] }>(
      ROUTES.prospecting.providerStatus(clientId),
      { showErrorToast: false },
    ).then((value) => {
      if (active) setResult(value);
    }).catch(() => {
      if (active) setResult({ configured: false, unavailable: true, providers: [] });
    });
    return () => { active = false; };
  }, [clientId]);

  if (!result) {
    return <div className="flex items-center gap-2 text-xs text-zinc-500" aria-label="Checking scraper status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking scraper status…</div>;
  }
  if (!result.configured || result.unavailable) {
    return (
      <div role="status" className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
        Scraper status is unavailable. Searches are protected; a failed run will remain recoverable and identify the required admin action.
      </div>
    );
  }

  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium text-zinc-300">Scraper status</summary>
      <div className="mt-2 flex flex-wrap gap-2">
        {result.providers.map((provider) => (
          <span
            key={provider.id}
            title={provider.diagnostic ?? undefined}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${
              provider.state === "working"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                : provider.state === "unavailable"
                  ? "border-red-500/25 bg-red-500/10 text-red-300"
                  : "border-amber-500/25 bg-amber-500/10 text-amber-300"
            }`}
          >
            {provider.state === "working"
              ? <CheckCircle2 className="h-3.5 w-3.5" />
              : provider.state === "unavailable"
                ? <TriangleAlert className="h-3.5 w-3.5" />
                : <CircleHelp className="h-3.5 w-3.5" />}
            {provider.label}: {provider.state === "working" ? "working" : provider.state === "unavailable" ? "needs admin attention" : "test due"}
          </span>
        ))}
      </div>
      <p className="mt-2 text-2xs text-zinc-600">Live tests are managed by portal admins to avoid unnecessary provider charges.</p>
    </details>
  );
}
