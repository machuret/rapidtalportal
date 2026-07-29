"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Share2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/api/routes";
import { vaultListKeys } from "@/hooks/useVaultList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  clientId: string;
  clientName: string;
  initialUrl: string;
}

export function LinkedInVaultSourcePanel({ clientId, clientName, initialUrl }: Props) {
  const queryClient = useQueryClient();
  const [profileUrl, setProfileUrl] = useState(initialUrl);
  const [maxPosts, setMaxPosts] = useState(10);
  const [collecting, setCollecting] = useState(false);

  async function collect() {
    if (!profileUrl.trim()) {
      toast.error("Add the company's LinkedIn page first.");
      return;
    }
    setCollecting(true);
    try {
      const result = await api.post<{ collected: number; warning?: string }>(
        ROUTES.vault.linkedin(),
        { clientId, profileUrl: profileUrl.trim(), maxPosts },
        { showErrorToast: false },
      );
      await queryClient.invalidateQueries({ queryKey: vaultListKeys.all(clientId) });
      if (result.warning) toast.warning(result.warning);
      else toast.success(`${result.collected} LinkedIn post${result.collected === 1 ? "" : "s"} added as style examples.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "LinkedIn posts could not be collected.");
    } finally {
      setCollecting(false);
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
            disabled={collecting}
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
            disabled={collecting}
            className="bg-zinc-950/60 border-zinc-700"
          />
        </label>
        <Button type="button" onClick={() => void collect()} disabled={collecting || !profileUrl.trim()}>
          {collecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          {collecting ? "Collecting…" : "Collect public posts"}
        </Button>
      </div>

      <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-zinc-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <p>
          Style-only boundary: collected posts are never treated as proof for factual claims. Only public pages are accessed; private or login-only content is not collected.
        </p>
      </div>
    </section>
  );
}
