"use client";

import { Info, Loader2, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DISCOVERY_SOURCE_CATALOG,
  ENABLED_DISCOVERY_SOURCES,
  discoverySourceCapabilities,
  type EnabledDiscoverySource,
} from "@/lib/prospecting/catalog";

export function LeadSearchForm({
  query, location, source, maxResults, starting, showMatching,
  requiredKeywords, preferredKeywords, excludedKeywords,
  minRating, minReviewCount, mustHaveWebsite,
  onQuery, onLocation, onSource, onMaxResults, onToggleMatching,
  onRequiredKeywords, onPreferredKeywords, onExcludedKeywords,
  onMinRating, onMinReviewCount, onMustHaveWebsite, onSubmit,
}: {
  query: string;
  location: string;
  source: EnabledDiscoverySource;
  maxResults: number;
  starting: boolean;
  showMatching: boolean;
  requiredKeywords: string;
  preferredKeywords: string;
  excludedKeywords: string;
  minRating: number;
  minReviewCount: number;
  mustHaveWebsite: boolean;
  onQuery: (value: string) => void;
  onLocation: (value: string) => void;
  onSource: (value: EnabledDiscoverySource) => void;
  onMaxResults: (value: number) => void;
  onToggleMatching: () => void;
  onRequiredKeywords: (value: string) => void;
  onPreferredKeywords: (value: string) => void;
  onExcludedKeywords: (value: string) => void;
  onMinRating: (value: number) => void;
  onMinReviewCount: (value: number) => void;
  onMustHaveWebsite: (value: boolean) => void;
  onSubmit: () => void;
}) {
  const capabilities = discoverySourceCapabilities(source);
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 md:p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white">Who do you want to find?</h2>
        <p className="mt-1 text-sm text-zinc-400">Describe the business type and location. Everything else is optional.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lead-query">Business type or service</Label>
          <Input id="lead-query" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="e.g. Mortgage brokers" maxLength={300} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-location">Location</Label>
          <Input id="lead-location" value={location} onChange={(event) => onLocation(event.target.value)} placeholder="e.g. Sydney, Australia" maxLength={300} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-source">Where to search</Label>
          <select id="lead-source" value={source} onChange={(event) => onSource(event.target.value as EnabledDiscoverySource)} className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none">
            {ENABLED_DISCOVERY_SOURCES.map((sourceId) => {
              const option = DISCOVERY_SOURCE_CATALOG[sourceId];
              return <option key={sourceId} value={sourceId}>{option.label} — {option.description.toLowerCase()}</option>;
            })}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-count">How many results?</Label>
          <select id="lead-count" value={maxResults} onChange={(event) => onMaxResults(Number(event.target.value))} className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none">
            {[10, 20, 50, 100].map((value) => <option key={value} value={value}>{value} leads</option>)}
          </select>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={onSubmit} disabled={starting}>
          {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          Find leads
        </Button>
        <p className="text-xs text-zinc-500">Results are reviewed here first. Nothing is added to CRM automatically.</p>
      </div>
      {!capabilities.supportsRatings && (
        <p className="mt-3 text-xs text-amber-300">Web search is broader and may return website candidates that need closer review.</p>
      )}
      <div className="mt-5 border-t border-zinc-800 pt-5">
        <button type="button" className="flex items-center gap-2 text-sm font-medium text-zinc-200 hover:text-white" onClick={onToggleMatching} aria-expanded={showMatching}>
          <Sparkles className="h-4 w-4 text-orange-400" />
          {showMatching ? "Hide ideal-customer matching" : "Improve matching (optional)"}
        </button>
        {showMatching && (
          <div className="mt-4 grid gap-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lead-required">Required terms</Label>
              <Input id="lead-required" value={requiredKeywords} onChange={(event) => onRequiredKeywords(event.target.value)} placeholder="e.g. commercial lending, brokers" />
              <p className="text-2xs text-zinc-500">Comma-separated. Missing required terms caps the fit score.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-preferred">Preferred terms</Label>
              <Input id="lead-preferred" value={preferredKeywords} onChange={(event) => onPreferredKeywords(event.target.value)} placeholder="e.g. property, private credit" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-excluded">Exclude terms</Label>
              <Input id="lead-excluded" value={excludedKeywords} onChange={(event) => onExcludedKeywords(event.target.value)} placeholder="e.g. residential only, recruitment" />
              <p className="text-2xs text-zinc-500">A matched exclusion caps the result as a weak fit.</p>
            </div>
            {capabilities.supportsRatings ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="lead-rating">Minimum rating</Label>
                  <select id="lead-rating" value={minRating} onChange={(event) => onMinRating(Number(event.target.value))} className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm">
                    {[0, 3.5, 4, 4.5].map((value) => <option key={value} value={value}>{value ? `${value}+` : "Any"}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-reviews">Minimum reviews</Label>
                  <select id="lead-reviews" value={minReviewCount} onChange={(event) => onMinReviewCount(Number(event.target.value))} className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm">
                    {[0, 10, 25, 50, 100].map((value) => <option key={value} value={value}>{value || "Any"}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <p className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-200">Web Search does not supply Maps ratings or review counts. Matching uses relevance, location, website evidence and contactability instead.</p>
            )}
            <label className="flex items-center gap-2 text-sm text-zinc-300 md:col-span-2">
              <input type="checkbox" checked={mustHaveWebsite} onChange={(event) => onMustHaveWebsite(event.target.checked)} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900" />
              A website is required for a good fit
            </label>
            <p className="flex items-start gap-2 text-xs text-zinc-500 md:col-span-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Fit scores are rule-based and show their components. Enrichment improves the evidence; it never changes your criteria.</p>
          </div>
        )}
      </div>
    </section>
  );
}
