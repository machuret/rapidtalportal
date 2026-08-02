import type {
  CompetitorCrawlJob,
  CompetitorRefreshCadence,
  CompetitorSource,
} from "@/types/competitors";

export const CADENCES: { value: CompetitorRefreshCadence; label: string }[] = [
  { value: "manual", label: "Manual refresh" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export const SOURCE_LABELS: Record<CompetitorSource["source_type"], string> = {
  website: "Website",
  blog: "Blog",
  page: "Single page",
  sitemap: "Sitemap",
  rss: "RSS / Atom",
  newsletter_archive: "Newsletter archive",
  youtube: "YouTube",
  social_profile: "Social profile",
  other: "Public URL",
};

const ACTIVE_JOB_STATUSES = new Set(["queued", "crawling", "ingesting"]);

export function formatDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function sourceState(source: CompetitorSource): {
  label: string;
  className: string;
  activeJob: CompetitorCrawlJob | null;
} {
  const activeJob = source.latest_job && ACTIVE_JOB_STATUSES.has(source.latest_job.status)
    ? source.latest_job
    : null;
  if (activeJob) {
    return {
      label: activeJob.status === "ingesting" ? "Saving content" : "Collecting",
      className: "border-blue-500/30 bg-blue-500/10 text-blue-300",
      activeJob,
    };
  }
  if (source.status === "connector_required") {
    return {
      label: "Connector required",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      activeJob: null,
    };
  }
  if (source.status === "error") {
    return {
      label: "Needs attention",
      className: "border-red-500/30 bg-red-500/10 text-red-300",
      activeJob: null,
    };
  }
  if (source.status === "retrying") {
    return {
      label: "Retry scheduled",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      activeJob: null,
    };
  }
  if (source.status === "paused") {
    return {
      label: "Paused",
      className: "border-zinc-700 bg-zinc-800 text-zinc-400",
      activeJob: null,
    };
  }
  return {
    label: "Ready",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    activeJob: null,
  };
}
