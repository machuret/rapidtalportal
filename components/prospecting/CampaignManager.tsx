"use client";

import { Archive, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CampaignProfileEditor } from "@/components/prospecting/CampaignProfileEditor";
import { statusClass, statusLabel } from "@/components/prospecting/presentation";
import type {
  ProspectingCampaign,
  ProspectingCampaignPage,
  ProspectingCollaborator,
  ProspectingIdealProfile,
} from "@/types/prospecting";

export function CampaignManager({
  campaigns,
  total,
  usage,
  collaborators,
  loading,
  pendingAction,
  onRun,
  onArchive,
  onAssign,
  onUpdateProfile,
  onLoadMore,
}: {
  campaigns: ProspectingCampaign[];
  total: number;
  usage: ProspectingCampaignPage["usage"];
  collaborators: ProspectingCollaborator[];
  loading: boolean;
  pendingAction: string | null;
  onRun: (campaign: ProspectingCampaign) => void;
  onArchive: (campaign: ProspectingCampaign) => void;
  onAssign: (campaign: ProspectingCampaign, ownerId: string | null) => void;
  onUpdateProfile: (campaign: ProspectingCampaign, profile: ProspectingIdealProfile) => Promise<void>;
  onLoadMore: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Campaigns</h2>
          <p className="text-sm text-zinc-400">Reuse successful searches without entering the criteria again.</p>
        </div>
        <p className="text-xs text-zinc-500">
          Today: {usage.runs_started} searches · {usage.results_returned} leads · {usage.enrichments_started} enrichment attempts · ${Number(usage.reported_cost_usd).toFixed(4)} provider-reported spend
        </p>
      </div>
      {loading ? (
        <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" aria-label="Loading campaigns" /></div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-400">No campaigns yet. Your first search will be saved automatically.</div>
      ) : (
        <div className="grid gap-3">
          {campaigns.map((campaign) => {
            const job = campaign.latest_job;
            const busy = pendingAction?.endsWith(campaign.id) || campaign.status === "running";
            return (
              <article key={campaign.id} className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 md:flex-row md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-zinc-100">{campaign.name}</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-2xs ${statusClass(campaign.status)}`}>{statusLabel(campaign.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {campaign.source === "google_maps" ? "Google Maps" : "Web search"} · Up to {campaign.max_results} results
                    {job?.status === "done" ? ` · ${job.returned_results} found` : ""}
                  </p>
                  <CampaignProfileEditor
                    key={`${campaign.id}:${campaign.updated_at}`}
                    campaign={campaign}
                    busy={pendingAction === `profile:${campaign.id}`}
                    onSave={(profile) => onUpdateProfile(campaign, profile)}
                  />
                  {job?.error_message && <p className="mt-1 text-xs text-red-300">{job.error_message}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor={`owner-${campaign.id}`} className="sr-only">Campaign owner</Label>
                  <select
                    id={`owner-${campaign.id}`}
                    aria-label={`Owner for ${campaign.name}`}
                    value={campaign.owner_id ?? ""}
                    disabled={busy}
                    onChange={(event) => onAssign(campaign, event.target.value || null)}
                    className="h-8 max-w-44 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-300"
                  >
                    <option value="">No owner</option>
                    {collaborators.map((person) => (
                      <option key={person.id} value={person.id}>{person.full_name || person.email}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onRun(campaign)}>
                    {pendingAction === `run:${campaign.id}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                    Run again
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => onArchive(campaign)}><Archive className="mr-1.5 h-3.5 w-3.5" />Archive</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!loading && campaigns.length < total && (
        <div className="flex justify-center"><Button variant="outline" onClick={onLoadMore}>Load more campaigns</Button></div>
      )}
    </section>
  );
}
