"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, FileSearch, Loader2, RotateCcw, Search, X } from "lucide-react";
import {
  CLIENT_NAVIGATION_DESTINATIONS,
  searchClientDestinations,
} from "@/lib/client-navigation";
import { reportClientDestination, reportClientExperience } from "@/lib/client-experience";
import { useClientDiscovery } from "@/hooks/useClientDiscovery";
import type { ClientDiscoveryKind } from "@/lib/discovery/types";

const QUICK_GOALS = [
  "Create content",
  "Tasks",
  "Knowledge",
  "Find leads",
  "Competitor insights",
  "Coach",
] as const;

export function ClientCommandPalette({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const reportedOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const discovery = useClientDiscovery(query, open);

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (!open && isEditableTarget(event.target)) return;
        event.preventDefault();
        setOpen((current) => !current);
      } else if (open && event.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpen() { setOpen(true); }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("rapidtal:open-client-navigation", onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("rapidtal:open-client-navigation", onOpen);
    };
  }, [enabled, open]);

  useEffect(() => {
    if (!open) {
      reportedOpenRef.current = false;
      setQuery("");
      setActiveIndex(0);
      if (wasOpenRef.current) {
        const frame = window.requestAnimationFrame(() => {
          if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
        });
        wasOpenRef.current = false;
        return () => window.cancelAnimationFrame(frame);
      }
      return;
    }
    if (!reportedOpenRef.current) {
      reportedOpenRef.current = true;
      reportClientExperience({
        eventType: "navigation_search_opened",
        path: pathname,
        metadata: { source: "command_palette" },
      });
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    wasOpenRef.current = true;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, pathname]);

  const results = useMemo(() => {
    const destinations = query.trim()
      ? searchClientDestinations(query).slice(0, 6)
      : CLIENT_NAVIGATION_DESTINATIONS.filter((item) => QUICK_GOALS.includes(item.label as typeof QUICK_GOALS[number]));
    const combined = [
      ...destinations.map((destination) => ({
        key: `destination:${destination.href}`,
        label: destination.label,
        description: destination.description,
        group: destination.group,
        href: destination.href,
        paths: destination.paths,
        resultKind: "destination" as const,
        status: null,
      })),
      ...(query.trim().length >= 2 ? discovery.results.map((record) => ({
        key: `${record.kind}:${record.id}`,
        label: record.title,
        description: record.detail,
        group: discoveryKindLabel(record.kind),
        href: record.href,
        paths: undefined,
        resultKind: record.kind,
        status: record.status,
      })) : []),
    ];
    if (!query.trim()) return combined;
    const needle = normalizeResultText(query);
    return combined
      .map((entry, index) => ({ entry, index, score: paletteResultScore(needle, entry.label, entry.description, entry.resultKind) }))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map(({ entry }) => entry);
  }, [discovery.results, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const result = document.getElementById(`client-navigation-result-${activeIndex}`);
    if (typeof result?.scrollIntoView === "function") result.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  function choose(index: number) {
    const destination = results[index];
    if (!destination) return;
    reportClientDestination({
      sourcePath: pathname,
      targetPath: destination.href,
      source: query.trim() ? "command_palette_search" : "command_palette_goal",
      queryTokenCount: tokenCount(query),
      resultCount: results.length,
      resultKind: destination.resultKind,
    });
    setOpen(false);
    router.push(destination.href);
  }

  function navigateResults(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => results.length ? (current + 1) % results.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => results.length ? (current - 1 + results.length) % results.length : 0);
    } else if (event.key === "Enter" && results.length > 0) {
      event.preventDefault();
      choose(activeIndex);
    }
  }

  function containKeyboardFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute("hidden"));
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!enabled || !open) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-start justify-center bg-black/70 px-4 pt-[10vh] backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-navigation-title"
        onKeyDown={containKeyboardFocus}
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4">
          <Search className="h-5 w-5 shrink-0 text-amber-300" />
          <label htmlFor="client-navigation-search" className="sr-only">Search RapidTal</label>
          <input
            ref={inputRef}
            id="client-navigation-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={navigateResults}
            placeholder="Find anything or start something"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="client-navigation-results"
            aria-expanded="true"
            aria-activedescendant={results[activeIndex] ? `client-navigation-result-${activeIndex}` : undefined}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-zinc-500"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation search"
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-3">
          <h2 id="client-navigation-title" aria-live="polite" className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {query.trim()
              ? discovery.loading
                ? "Searching RapidTal…"
                : `${results.length} result${results.length === 1 ? "" : "s"}`
              : "Common goals"}
          </h2>
          {results.length > 0 ? (
            <div id="client-navigation-results" role="listbox" aria-label="Matching RapidTal destinations" className="space-y-1">
              {results.map((destination, index) => {
                const active = (destination.paths ?? [destination.href]).some(
                  (path) => pathname === path || pathname.startsWith(`${path}/`),
                );
                return (
                  <button
                    type="button"
                    key={destination.key}
                    id={`client-navigation-result-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(index)}
                    aria-current={active ? "page" : undefined}
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${index === activeIndex ? "bg-zinc-800/80" : "hover:bg-zinc-800/80"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                        {destination.label}
                        <span className="text-2xs font-normal text-zinc-600">{destination.group}</span>
                        {destination.status && <span className="rounded bg-zinc-700/70 px-1.5 py-0.5 text-3xs font-normal capitalize text-zinc-400">{destination.status.replaceAll("_", " ")}</span>}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{destination.description}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-300" />
                  </button>
                );
              })}
            </div>
          ) : discovery.loading ? (
            <div id="client-navigation-results" role="status" className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching tasks, drafts, knowledge, competitors, leads and contacts…
            </div>
          ) : discovery.error ? (
            <div id="client-navigation-results" role="alert" className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-5 py-7 text-center">
              <p className="text-sm font-medium text-amber-100">Saved records could not be searched</p>
              <p className="mt-1 text-xs text-zinc-500">Feature shortcuts still work. Retry the record search without closing this window.</p>
              <button type="button" onClick={discovery.retry} className="mt-3 inline-flex items-center text-sm font-medium text-amber-300 hover:text-amber-200">
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
              </button>
            </div>
          ) : (
            <div id="client-navigation-results" role="status" className="rounded-xl border border-dashed border-zinc-700 px-5 py-8 text-center">
              <FileSearch className="mx-auto mb-2 h-5 w-5 text-zinc-600" />
              <p className="text-sm font-medium text-zinc-200">Nothing matched “{query.trim()}”</p>
              <p className="mt-1 text-xs text-zinc-500">Search a task, draft, document, competitor, lead or contact—or describe what you want to start.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-4">
              <Link
                href="/ask"
                onClick={() => {
                  try { sessionStorage.setItem("rapidtal:coach-prefill", query.trim().slice(0, 500)); } catch { /* optional browser storage */ }
                  reportClientDestination({
                    sourcePath: pathname,
                    targetPath: "/ask",
                    source: "command_palette_no_match",
                    queryTokenCount: tokenCount(query),
                    resultCount: 0,
                  });
                  setOpen(false);
                }}
                className="inline-flex text-sm font-medium text-purple-300 hover:text-purple-200"
              >
                Ask Coach
              </Link>
              <Link
                href={`/guide?q=${encodeURIComponent(query.trim())}`}
                onClick={() => {
                  reportClientDestination({
                    sourcePath: pathname,
                    targetPath: "/guide",
                    source: "command_palette_no_match",
                    queryTokenCount: tokenCount(query),
                    resultCount: 0,
                  });
                  setOpen(false);
                }}
                className="inline-flex text-sm font-medium text-amber-300 hover:text-amber-200"
              >
                Search the Guide
              </Link>
              </div>
            </div>
          )}
          {discovery.partial && results.length > 0 && (
            <p className="mt-2 px-2 text-2xs text-amber-300" role="status">Some record types are temporarily unavailable. The results shown are safe to use.</p>
          )}
          {discovery.error && results.length > 0 && (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200" role="alert">
              <span>Feature shortcuts are available, but saved records could not be searched.</span>
              <button type="button" onClick={discovery.retry} className="shrink-0 font-medium underline underline-offset-2">Retry</button>
            </div>
          )}
          {query.trim().length >= 2 && !discovery.loading && !discovery.error && !discovery.expanded && discovery.results.length >= 8 && (
            <button type="button" onClick={discovery.expand} className="mt-2 w-full rounded-lg px-3 py-2 text-center text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white">
              Search more saved records
            </button>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-2 text-2xs text-zinc-600">
          <span>Find records or describe a goal</span>
          <span>↑↓ choose · Enter open · Esc close</span>
        </div>
      </section>
    </div>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable
    || Boolean(target.closest('[contenteditable="true"]'));
}

function normalizeResultText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function paletteResultScore(query: string, label: string, description: string, kind: string) {
  const normalizedLabel = normalizeResultText(label);
  const candidate = `${normalizedLabel} ${normalizeResultText(description)}`;
  const recordBonus = kind === "destination" ? 0 : 25;
  if (normalizedLabel === query) return 1_000 + recordBonus;
  if (normalizedLabel.startsWith(query)) return 850 + recordBonus;
  if (candidate.includes(query)) return 700 + recordBonus;
  const terms = query.split(/\s+/u).filter(Boolean);
  return terms.every((term) => candidate.includes(term)) ? 500 + recordBonus : 0;
}

function tokenCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function discoveryKindLabel(kind: ClientDiscoveryKind) {
  return ({
    task: "Task",
    notebook: "Notebook",
    knowledge: "Knowledge",
    draft: "Content",
    project: "In progress",
    competitor: "Competitor",
    lead: "Lead",
    contact: "CRM",
  } as const)[kind];
}
