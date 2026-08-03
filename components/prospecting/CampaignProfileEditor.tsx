"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { discoverySourceCapabilities } from "@/lib/prospecting/catalog";
import { keywordList, matchingSummary } from "@/components/prospecting/presentation";
import type { ProspectingCampaign, ProspectingIdealProfile } from "@/types/prospecting";

export function CampaignProfileEditor({
  campaign,
  busy,
  onSave,
}: {
  campaign: ProspectingCampaign;
  busy: boolean;
  onSave: (profile: ProspectingIdealProfile) => Promise<void>;
}) {
  const profile = campaign.ideal_profile;
  const [required, setRequired] = useState((profile.requiredKeywords ?? []).join(", "));
  const [preferred, setPreferred] = useState((profile.preferredKeywords ?? []).join(", "));
  const [excluded, setExcluded] = useState((profile.excludedKeywords ?? []).join(", "));
  const [rating, setRating] = useState(profile.minRating ?? 0);
  const [reviews, setReviews] = useState(profile.minReviewCount ?? 0);
  const [website, setWebsite] = useState(profile.mustHaveWebsite ?? false);

  return (
    <details className="mt-2 text-xs text-zinc-500">
      <summary className="cursor-pointer hover:text-zinc-300">Matching rules: {matchingSummary(campaign.ideal_profile)}</summary>
      <div className="mt-3 grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 md:grid-cols-2">
        <Input aria-label="Required matching terms" value={required} onChange={(event) => setRequired(event.target.value)} placeholder="Required terms" />
        <Input aria-label="Preferred matching terms" value={preferred} onChange={(event) => setPreferred(event.target.value)} placeholder="Preferred terms" />
        <Input aria-label="Excluded matching terms" value={excluded} onChange={(event) => setExcluded(event.target.value)} placeholder="Excluded terms" />
        {discoverySourceCapabilities(campaign.source).supportsRatings ? (
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Minimum campaign rating" value={rating} onChange={(event) => setRating(Number(event.target.value))} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-2">
              {[0, 3.5, 4, 4.5].map((value) => <option key={value} value={value}>{value ? `${value}+ rating` : "Any rating"}</option>)}
            </select>
            <select aria-label="Minimum campaign reviews" value={reviews} onChange={(event) => setReviews(Number(event.target.value))} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-2">
              {[0, 10, 25, 50, 100].map((value) => <option key={value} value={value}>{value ? `${value}+ reviews` : "Any reviews"}</option>)}
            </select>
          </div>
        ) : (
          <p className="rounded-md border border-blue-500/20 bg-blue-500/5 p-2 text-blue-200">Ratings and review counts are not available from Web Search, so they are not used for matching.</p>
        )}
        <label className="flex items-center gap-2 text-zinc-300">
          <input type="checkbox" checked={website} onChange={(event) => setWebsite(event.target.checked)} />
          Require a website
        </label>
        <div className="flex justify-end">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onSave({
            requiredKeywords: keywordList(required), preferredKeywords: keywordList(preferred),
            excludedKeywords: keywordList(excluded),
            minRating: discoverySourceCapabilities(campaign.source).supportsRatings ? rating : 0,
            minReviewCount: discoverySourceCapabilities(campaign.source).supportsReviewCounts ? reviews : 0,
            mustHaveWebsite: website,
          })}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save matching rules
          </Button>
        </div>
      </div>
    </details>
  );
}
