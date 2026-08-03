"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CLIENT_GUIDE, type GuideGroup } from "@/lib/client-guide";
import { ArrowRight, ChevronDown, ChevronRight, CheckCircle2, Lightbulb, Search, Target, PlayCircle, X } from "lucide-react";
import { LoomEmbed } from "@/components/help/LoomEmbed";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CLIENT_NAVIGATION_DESTINATIONS, matchesClientSearch } from "@/lib/client-navigation";
import { reportClientDestination, reportClientExperience } from "@/lib/client-experience";

/** Slug for a guide item's anchor, so PageIntro can deep-link to it. */
const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const GUIDE_GOALS = [
  { label: "Tasks", prompt: "Request work from my VA" },
  { label: "Create content", prompt: "Create marketing content" },
  { label: "Knowledge", prompt: "Teach RapidTal about my company" },
  { label: "Find leads", prompt: "Find and qualify leads" },
  { label: "Competitor insights", prompt: "Understand my competitors" },
  { label: "Coach", prompt: "Ask for company-aware help" },
] as const;

/** Collapsible, plain-language guide. Renders the client guide by default, or
 *  any set of groups passed in (e.g. the VA guide). Honours ?open=<item title>
 *  so a page's "Learn more →" link opens and scrolls to the right item. */
export function ClientGuide({
  groups = CLIENT_GUIDE,
  clientMode = true,
}: {
  groups?: GuideGroup[];
  clientMode?: boolean;
}) {
  const params = useSearchParams();
  const requested = params.get("open");
  const requestedQuery = params.get("q") ?? "";
  const known = requested && groups.some((g) => g.items.some((i) => i.title === requested)) ? requested : null;
  const [open, setOpen] = useState<string | null>(known ?? groups[0]?.items[0]?.title ?? null);
  const [query, setQuery] = useState(requestedQuery);
  const lastReportedSearch = useRef("");

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return groups;
    return groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const destinations = CLIENT_NAVIGATION_DESTINATIONS.filter((entry) => entry.guideTitle === item.title);
        const searchable = [
          item.title,
          item.what,
          item.why,
          item.tip ?? "",
          ...item.can,
          ...item.how,
          ...destinations.flatMap((destination) => [destination.description, ...(destination.keywords ?? [])]),
        ];
        return matchesClientSearch(query, searchable);
      }),
    })).filter((group) => group.items.length > 0);
  }, [groups, query]);

  const resultCount = filteredGroups.reduce((total, group) => total + group.items.length, 0);

  // Deep-link: open + scroll to the requested item once on mount.
  useEffect(() => {
    if (!known) return;
    setOpen(known);
    const el = document.getElementById(`guide-${slug(known)}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [known]);

  useEffect(() => {
    setQuery(requestedQuery);
  }, [requestedQuery]);

  useEffect(() => {
    if (!query.trim() || resultCount !== 1) return;
    setOpen(filteredGroups[0]?.items[0]?.title ?? null);
  }, [filteredGroups, query, resultCount]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;
    const signature = `${normalized.toLocaleLowerCase()}:${resultCount}`;
    const timeout = window.setTimeout(() => {
      if (lastReportedSearch.current === signature) return;
      lastReportedSearch.current = signature;
      reportClientExperience({
        eventType: "guide_search_used",
        path: "/guide",
        metadata: {
          source: requestedQuery ? "navigation_handoff" : "guide",
          query_token_count: normalized.split(/\s+/).length,
          result_count: resultCount,
        },
      });
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [query, requestedQuery, resultCount]);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="guide-search-title">
        <label id="guide-search-title" htmlFor="guide-search" className="text-lg font-bold text-white">Search the Guide</label>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            id="guide-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try “approve content”, “add a document” or “request work”"
            className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 pl-10 pr-10 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear Guide search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {query.trim() && (
          <p className="mt-2 text-xs text-zinc-500" aria-live="polite">
            {resultCount} guide result{resultCount === 1 ? "" : "s"} for “{query.trim()}”
          </p>
        )}
      </section>

      {clientMode && !query.trim() && <section aria-labelledby="guide-goals-title">
        <h2 id="guide-goals-title" className="text-lg font-bold text-white">What do you want to do?</h2>
        <p className="mt-0.5 text-sm text-zinc-400">Open a common workflow now, or search the Guide in plain English.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDE_GOALS.map((goal) => {
            const destination = CLIENT_NAVIGATION_DESTINATIONS.find((item) => item.label === goal.label);
            if (!destination) return null;
            return (
              <Link
                key={goal.label}
                href={destination.href}
                onClick={() => reportClientDestination({
                  sourcePath: "/guide",
                  targetPath: destination.href,
                  source: "guide_goal",
                })}
                className="group surface-card flex items-center gap-3 px-4 py-3 hover:border-zinc-700"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-100">{goal.prompt}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">Open {goal.label}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-300" />
              </Link>
            );
          })}
        </div>
      </section>}

      {resultCount === 0 && query.trim() && (
        <section className="rounded-xl border border-dashed border-zinc-700 px-6 py-8 text-center">
          <p className="text-sm font-medium text-zinc-200">No guide section matched “{query.trim()}”</p>
          <p className="mt-1 text-xs text-zinc-500">Try the outcome you want, such as “write a post”, “add a lead” or “message my VA”.</p>
          <button type="button" onClick={() => setQuery("")} className="mt-4 text-sm font-medium text-amber-300 hover:text-amber-200">Show the full Guide</button>
        </section>
      )}

      {filteredGroups.map((group) => (
        <section key={group.heading}>
          <h2 className="text-lg font-bold text-white">{group.heading}</h2>
          {group.blurb && <p className="text-sm text-zinc-400 mt-0.5 mb-3">{group.blurb}</p>}
          <div className="flex flex-col gap-2 mt-2">
            {group.items.map((item) => {
              const isOpen = open === item.title;
              const itemSlug = `${slug(group.heading)}-${slug(item.title)}`;
              const triggerId = `guide-trigger-${itemSlug}`;
              const panelId = `guide-panel-${itemSlug}`;
              return (
                <div key={item.title} id={`guide-${slug(item.title)}`} className="surface-card overflow-hidden scroll-mt-4">
                  <button
                    type="button"
                    id={triggerId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? null : item.title)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left"
                  >
                    <span className="font-semibold text-zinc-100 flex-1">{item.title}</span>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
                  </button>
                  {isOpen && (
                    <div id={panelId} role="region" aria-labelledby={triggerId} className="px-4 pb-4 pt-3 flex flex-col gap-4 border-t border-zinc-800">
                      {item.video && (
                        <div>
                          <p className="label-section mb-1.5 flex items-center gap-1.5">
                            <PlayCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            Watch
                          </p>
                          <LoomEmbed url={item.video} title={item.title} />
                        </div>
                      )}
                      <p className="text-sm text-zinc-300 leading-relaxed">{item.what}</p>
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                        <p className="flex items-center gap-1.5 label-section text-emerald-400 mb-1">
                          <Target className="w-3.5 h-3.5 shrink-0" />
                          Why it matters
                        </p>
                        <p className="text-sm text-zinc-300 leading-relaxed">{item.why}</p>
                      </div>
                      <div>
                        <p className="label-section mb-1.5">What you can do</p>
                        <ul className="flex flex-col gap-1.5">
                          {item.can.map((c, i) => (
                            <li key={i} className="flex gap-2 text-sm text-zinc-300 leading-relaxed">
                              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="label-section mb-1.5">How to use it</p>
                        <ol className="flex flex-col gap-1.5">
                          {item.how.map((h, i) => (
                            <li key={i} className="flex gap-2 text-sm text-zinc-300 leading-relaxed">
                              <span className="text-amber-400 font-semibold shrink-0">{i + 1}.</span>
                              <span>{h}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                      {item.tip && (
                        <div className="flex gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2.5">
                          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-sm text-zinc-300 leading-relaxed"><span className="font-semibold text-amber-400">Tip:</span> {item.tip}</p>
                        </div>
                      )}
                      {item.href && (
                        <Link
                          href={item.href}
                          onClick={() => reportClientDestination({
                            sourcePath: "/guide",
                            targetPath: item.href!,
                            source: "guide_article",
                          })}
                          className={cn(buttonVariants({ variant: "outline" }), "self-start border-zinc-700")}
                        >
                          Open {item.title}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
