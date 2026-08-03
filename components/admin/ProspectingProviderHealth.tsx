"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleDashed, ExternalLink, Loader2, Play, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-message";
import { ROUTES } from "@/lib/api/routes";

type CheckStatus = "queued" | "running" | "passed" | "warning" | "failed";
type ProviderCheck = {
  id: string;
  status: CheckStatus;
  usable_results: number | null;
  latency_ms: number | null;
  usage_total_usd: number | null;
  provider_status: string | null;
  diagnostic: string | null;
  actor_build_requested: string;
  actor_build_id: string | null;
  actor_run_id: string | null;
  completed_at: string | null;
  created_at: string;
};
type Provider = {
  id: "google_maps" | "google_search" | "linkedin_profiles" | "website_enrichment";
  enabled: boolean;
  label: string;
  description: string;
  actorId: string;
  build: string;
  latestCheck: ProviderCheck | null;
};
type HealthResponse = {
  configured: boolean;
  providers: Provider[];
  unavailable?: boolean;
  error?: string;
};

const terminal = new Set<CheckStatus>(["passed", "warning", "failed"]);

function ageLabel(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function state(check: ProviderCheck | null): "green" | "amber" | "red" {
  if (!check) return "amber";
  if (check.status === "failed") return "red";
  if (check.status === "passed") {
    const age = Date.now() - new Date(check.completed_at ?? check.created_at).getTime();
    return age <= 7 * 24 * 60 * 60_000 ? "green" : "amber";
  }
  return "amber";
}

export function ProspectingProviderHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const mounted = useRef(true);

  async function load() {
    try {
      const result = await api.get<HealthResponse>(ROUTES.admin.prospectingProviders());
      if (mounted.current) setHealth(result);
    } catch (error) {
      if (mounted.current) setFailure(errorMessage(error, "Scraper health could not be loaded."));
    }
  }

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, []);

  async function poll(provider: Provider, checkId: string): Promise<void> {
    for (let attempt = 0; attempt < 80 && mounted.current; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 3_000));
      const result = await api.post<{ check: ProviderCheck }>(ROUTES.admin.prospectingProviders(), {
        provider: provider.id,
        checkId,
      });
      setHealth((current) => current ? {
        ...current,
        providers: current.providers.map((item) => item.id === provider.id ? { ...item, latestCheck: result.check } : item),
      } : current);
      if (terminal.has(result.check.status)) return;
    }
    throw new Error("The check is still running. Its result will remain available after you refresh this page.");
  }

  async function testProvider(provider: Provider) {
    if (busy) return;
    setBusy(provider.id);
    setFailure(null);
    try {
      const result = await api.post<{ check: ProviderCheck }>(ROUTES.admin.prospectingProviders(), { provider: provider.id });
      setHealth((current) => current ? {
        ...current,
        providers: current.providers.map((item) => item.id === provider.id ? { ...item, latestCheck: result.check } : item),
      } : current);
      if (!terminal.has(result.check.status)) await poll(provider, result.check.id);
    } catch (error) {
      setFailure(errorMessage(error, "The scraper test could not be completed."));
      await load();
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  if (!health) {
    return <section className="surface-card p-4 lg:col-span-2" aria-busy="true"><p className="text-sm text-zinc-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading scraper health…</p></section>;
  }

  return (
    <section className="surface-card p-4 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label-section flex items-center gap-2"><CircleDashed className="h-4 w-4" /> Lead scraper checks</p>
          <p className="mt-1 text-xs text-zinc-500">A green light means the pinned Actor build ran and produced data RapidTal could actually read within the last seven days.</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${health.configured ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`}>
          Apify API {health.configured ? "connected" : "not configured"}
        </span>
      </div>
      {(failure || health.error) && <p role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{failure ?? health.error}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {health.providers.map((provider) => {
          const check = provider.latestCheck;
          const light = state(check);
          const working = busy === provider.id || check?.status === "queued" || check?.status === "running";
          return (
            <article key={provider.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {working ? <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-amber-300" aria-label="test running" />
                    : light === "green" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-400" aria-label="working" />
                    : light === "red" ? <XCircle className="mt-0.5 h-5 w-5 text-red-400" aria-label="failed" />
                    : <TriangleAlert className="mt-0.5 h-5 w-5 text-amber-400" aria-label="needs test" />}
                  <div>
                    <p className="font-medium text-zinc-100">{provider.label}</p>
                    <p className="text-xs text-zinc-500">{provider.description}</p>
                  </div>
                </div>
                {!provider.enabled && <span className="rounded bg-zinc-800 px-2 py-0.5 text-2xs text-zinc-400">Pilot only</span>}
              </div>
              <div className="mt-3 min-h-10 text-xs text-zinc-400">
                {!check ? "Never tested in this environment."
                  : working ? `Apify status: ${check.provider_status?.toLowerCase() ?? "starting"}. This page can be closed safely.`
                  : <>
                    <span className={light === "green" ? "text-green-300" : light === "red" ? "text-red-300" : "text-amber-300"}>{check.diagnostic}</span>
                    <span className="mt-1 block text-zinc-600">Build {check.actor_build_requested} · {ageLabel(check.completed_at ?? check.created_at)}{check.latency_ms != null ? ` · ${(check.latency_ms / 1000).toFixed(1)}s` : ""}</span>
                  </>}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <Button size="sm" variant="outline" disabled={!health.configured || working || health.unavailable} onClick={() => void testProvider(provider)}>
                  {working ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                  {check ? "Test again" : "Run test"}
                </Button>
                {check?.actor_run_id && <a className="flex items-center gap-1 text-2xs text-zinc-600 hover:text-zinc-300" href={`https://console.apify.com/actors/runs/${encodeURIComponent(check.actor_run_id)}`} target="_blank" rel="noreferrer">Apify run <ExternalLink className="h-3 w-3" /></a>}
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-3 text-2xs text-zinc-600">Tests request only 1–5 records with a USD $0.50 hard cap. Amber means untested, stale or still running. Red means the provider returned no usable data or the normaliser failed.</p>
    </section>
  );
}
