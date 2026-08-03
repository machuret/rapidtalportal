"use client";

import { Clock3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prospectingActivityLabel } from "@/lib/prospecting/activity";
import type { ProspectingActivityEvent } from "@/types/prospecting";

export function ProspectingActivityTimeline({
  events,
  total,
  loading,
  onLoadMore,
}: {
  events: ProspectingActivityEvent[];
  total: number;
  loading: boolean;
  onLoadMore: () => void;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Team activity</h2>
        <p className="text-sm text-zinc-400">See collections, assignments, lead decisions and CRM handoffs across the team.</p>
      </div>
      {loading && events.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" aria-label="Loading activity" /></div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-400">No lead-generation activity has been recorded yet.</div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <article key={event.id} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
              <div className="min-w-0">
                <p className="text-sm text-zinc-200">
                  <span className="font-medium">{event.actor_name || "System"}</span>{" "}
                  {prospectingActivityLabel(event.event_type)}
                  {event.subject_name ? ` · ${event.subject_name}` : ""}
                </p>
                {(event.lead_name || event.campaign_name) && (
                  <p className="mt-1 text-xs text-zinc-400">
                    {[event.lead_name, event.campaign_name].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="mt-1 text-xs text-zinc-500">{new Date(event.created_at).toLocaleString("en-AU")}</p>
              </div>
            </article>
          ))}
          {events.length < total && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" disabled={loading} onClick={onLoadMore}>
                {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Load more activity
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
