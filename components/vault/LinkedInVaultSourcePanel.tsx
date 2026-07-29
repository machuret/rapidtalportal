"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FlaskConical, Loader2, Share2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { STYLE_SOURCES_UPDATED_EVENT } from "@/lib/content/style-analysis";
import { vaultListKeys } from "@/hooks/useVaultList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  clientId: string;
  clientName: string;
  initialUrl: string;
}

interface DiscoveryReport {
  provider: string;
  returned: number;
  accepted: number;
  attempts: Array<{
    provider: "apify" | "firecrawl";
    query: string;
    status: number;
    returned: number;
    error: string | null;
  }>;
  candidates: Array<{
    provider: "apify" | "firecrawl";
    url: string | null;
    accepted: boolean;
    reason: "accepted" | "missing_url" | "different_company" | "insufficient_content" | "duplicate";
    contentCharacters: number;
  }>;
}

interface LinkedInResult {
  collected?: number;
  warning?: string;
  test?: boolean;
  discovery: DiscoveryReport;
}

const reasonLabels: Record<DiscoveryReport["candidates"][number]["reason"], string> = {
  accepted: "Ready to collect",
  missing_url: "No post URL returned",
  different_company: "Not from this company page",
  insufficient_content: "Post text was unavailable",
  duplicate: "Duplicate result",
};

export function LinkedInVaultSourcePanel({ clientId, clientName, initialUrl }: Props) {
  const queryClient = useQueryClient();
  const [profileUrl, setProfileUrl] = useState(initialUrl);
  const [maxPosts, setMaxPosts] = useState(10);
  const [activeAction, setActiveAction] = useState<"test" | "collect" | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryReport | null>(null);

  async function run(mode: "test" | "collect") {
    if (!profileUrl.trim()) {
      toast.error("Add the company's LinkedIn page first.");
      return;
    }
    setActiveAction(mode);
    try {
      const result = await api.post<LinkedInResult>(
        ROUTES.vault.linkedin(),
        { clientId, profileUrl: profileUrl.trim(), maxPosts, mode },
        { showErrorToast: false },
      );
      setDiscovery(result.discovery);
      if (mode === "test") {
        if (result.discovery.accepted > 0) {
          toast.success(`Discovery test found ${result.discovery.accepted} usable LinkedIn post${result.discovery.accepted === 1 ? "" : "s"}.`);
        } else {
          toast.warning("The live discovery test did not return a usable post. See the diagnostic below.");
        }
      } else {
        await queryClient.invalidateQueries({ queryKey: vaultListKeys.all(clientId) });
        window.dispatchEvent(new CustomEvent(STYLE_SOURCES_UPDATED_EVENT, {
          detail: { clientId },
        }));
        if (result.warning) toast.warning(result.warning);
        else {
          const collected = result.collected ?? 0;
          toast.success(`${collected} LinkedIn post${collected === 1 ? "" : "s"} added as style examples.`);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "LinkedIn posts could not be collected.");
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-sky-500/25 bg-sky-500/5 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-sky-500/15 p-2">
          <Share2 className="h-5 w-5 text-sky-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-white">LinkedIn style source</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Add {clientName}&apos;s official company page and collect its recent publicly discoverable posts. These teach the content engine voice, rhythm and format.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_auto] md:items-end">
        <label className="space-y-1.5">
          <Label htmlFor="linkedin-company-page">LinkedIn company page</Label>
          <Input
            id="linkedin-company-page"
            type="url"
            value={profileUrl}
            onChange={(event) => setProfileUrl(event.target.value)}
            placeholder="https://www.linkedin.com/company/company-name"
            disabled={activeAction !== null}
            className="bg-zinc-950/60 border-zinc-700"
          />
        </label>
        <label className="space-y-1.5">
          <Label htmlFor="linkedin-post-limit">Posts to collect</Label>
          <Input
            id="linkedin-post-limit"
            type="number"
            min={1}
            max={20}
            value={maxPosts}
            onChange={(event) => setMaxPosts(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
            disabled={activeAction !== null}
            className="bg-zinc-950/60 border-zinc-700"
          />
        </label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void run("test")}
            disabled={activeAction !== null || !profileUrl.trim()}
          >
            {activeAction === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            {activeAction === "test" ? "Testing…" : "Test discovery"}
          </Button>
          <Button
            type="button"
            onClick={() => void run("collect")}
            disabled={activeAction !== null || !profileUrl.trim()}
          >
            {activeAction === "collect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            {activeAction === "collect" ? "Collecting…" : "Collect public posts"}
          </Button>
        </div>
      </div>

      {discovery && (
        <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-950/60 p-4 text-xs">
          <div className="flex items-center gap-2">
            {discovery.accepted > 0
              ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              : <XCircle className="h-4 w-4 text-amber-400" />}
            <p className="font-medium text-zinc-200">
              Live test: {discovery.accepted} usable post{discovery.accepted === 1 ? "" : "s"} from {discovery.returned} result{discovery.returned === 1 ? "" : "s"}
            </p>
          </div>
          <div className="mt-3 space-y-2 text-zinc-400">
            {discovery.attempts.map((attempt) => (
              <div key={attempt.query} className="rounded border border-zinc-800 px-3 py-2">
                <p className="break-all text-zinc-300">{attempt.query}</p>
                <p className="mt-1">
                  {attempt.provider === "apify" ? "Apify" : "Firecrawl"} returned {attempt.returned} result{attempt.returned === 1 ? "" : "s"}
                  {attempt.status > 0 ? ` · HTTP ${attempt.status}` : ""}
                  {attempt.error ? ` · ${attempt.error}` : ""}
                </p>
              </div>
            ))}
            {discovery.candidates.slice(0, 10).map((candidate, index) => (
              <div key={`${candidate.url ?? "missing"}-${index}`} className="flex items-start gap-2">
                {candidate.accepted
                  ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />}
                <div className="min-w-0">
                  <p className="text-zinc-300">
                    {candidate.provider === "apify" ? "Apify" : "Firecrawl"} · {reasonLabels[candidate.reason]} · {candidate.contentCharacters} text characters
                  </p>
                  {candidate.url && <p className="truncate text-zinc-500">{candidate.url}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-zinc-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <p>
          Style-only boundary: collected posts are never treated as proof for factual claims. Only public pages are accessed; private or login-only content is not collected.
        </p>
      </div>
    </section>
  );
}
