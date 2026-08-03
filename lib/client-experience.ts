export const CLIENT_EXPERIENCE_EVENTS = [
  "page_ready",
  "feature_ready",
  "feature_error",
  "page_slow",
  "page_retry",
  "page_error",
] as const;

export type ClientExperienceEvent = (typeof CLIENT_EXPERIENCE_EVENTS)[number];

export interface ClientExperienceEventInput {
  eventType: ClientExperienceEvent;
  path: string;
  durationMs?: number;
  metadata?: Record<string, string | number | boolean | null>;
}

interface NavigationContext {
  id: string;
  path: string;
  startedAt: number;
  attempt: number;
}

const NAVIGATION_CONTEXT_KEY = "rapidtal:navigation-context";

function readNavigationContext(): NavigationContext | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(NAVIGATION_CONTEXT_KEY) ?? "null") as Partial<NavigationContext> | null;
    if (!value || typeof value.id !== "string" || typeof value.path !== "string"
      || typeof value.startedAt !== "number" || typeof value.attempt !== "number") return null;
    return value as NavigationContext;
  } catch { return null; }
}

function writeNavigationContext(context: NavigationContext): NavigationContext {
  try { sessionStorage.setItem(NAVIGATION_CONTEXT_KEY, JSON.stringify(context)); } catch { /* ignore */ }
  return context;
}

export function beginClientNavigation(path: string, startedAt = Date.now(), force = false): NavigationContext {
  const current = readNavigationContext();
  if (!force && current?.path === path && Date.now() - current.startedAt < 10_000) return current;
  return writeNavigationContext({ id: crypto.randomUUID(), path, startedAt, attempt: 0 });
}

export function ensureClientNavigation(path: string, startedAt = Date.now()): NavigationContext {
  const current = readNavigationContext();
  return current?.path === path ? current : beginClientNavigation(path, startedAt, true);
}

export function retryClientNavigation(path: string): NavigationContext {
  const current = ensureClientNavigation(path);
  return writeNavigationContext({ ...current, startedAt: Date.now(), attempt: current.attempt + 1 });
}

export function reportClientFeatureReady(path: string, feature: string): void {
  const navigation = ensureClientNavigation(path);
  reportClientExperience({
    eventType: "feature_ready",
    path,
    durationMs: Math.max(0, Date.now() - navigation.startedAt),
    metadata: { feature },
  });
}

/**
 * Records navigation quality without ever blocking the client's work. The API
 * owns authentication, tenant attribution and durable storage; callers only
 * provide non-sensitive route timing metadata.
 */
export function reportClientExperience(input: ClientExperienceEventInput): void {
  try {
    const navigation = typeof window === "undefined" ? null : ensureClientNavigation(input.path);
    void fetch("/api/experience/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        navigationId: navigation?.id,
        attempt: navigation?.attempt,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Measurement must never make the portal harder to use.
  }
}

export interface ClientLoadingCopy {
  label: string;
  detail: string;
}

const ROUTE_LOADING_COPY: Array<{ prefix: string; copy: ClientLoadingCopy }> = [
  { prefix: "/lead-generation", copy: { label: "lead workspace", detail: "Loading campaigns, searches and lead results." } },
  { prefix: "/content", copy: { label: "content workspace", detail: "Loading your ideas, drafts and saved progress." } },
  { prefix: "/compose", copy: { label: "writing workspace", detail: "Loading your draft and company context." } },
  { prefix: "/company-dna", copy: { label: "company profile", detail: "Loading company details, voice and competitors." } },
  { prefix: "/vault", copy: { label: "company knowledge", detail: "Loading your sources and knowledge readiness." } },
  { prefix: "/brain", copy: { label: "Company Brain", detail: "Loading readiness, learning and recent activity." } },
  { prefix: "/ask", copy: { label: "RapidTal Coach", detail: "Loading your private Coach workspace and company context." } },
  { prefix: "/team", copy: { label: "team workspace", detail: "Loading team profiles, activity and work summaries." } },
  { prefix: "/reports", copy: { label: "reports", detail: "Preparing your delivery and activity summary." } },
  { prefix: "/crm", copy: { label: "CRM", detail: "Loading contacts, follow-ups and pipeline stages." } },
  { prefix: "/tasks", copy: { label: "task board", detail: "Loading shared work and current progress." } },
  { prefix: "/messages", copy: { label: "messages", detail: "Loading your shared team conversation." } },
  { prefix: "/notebook", copy: { label: "Notebook", detail: "Loading shared pages and recent changes." } },
  { prefix: "/daily-log", copy: { label: "daily log", detail: "Loading today's update and recent activity." } },
  { prefix: "/my-job", copy: { label: "job workspace", detail: "Loading your work details, leave and documents." } },
  { prefix: "/sops", copy: { label: "procedure library", detail: "Loading saved procedures and progress." } },
  { prefix: "/tools", copy: { label: "tools", detail: "Loading the selected workspace and saved inputs." } },
  { prefix: "/guide", copy: { label: "client guide", detail: "Loading current feature guidance and direct links." } },
  { prefix: "/profile", copy: { label: "profile", detail: "Loading account details and preferences." } },
  { prefix: "/access", copy: { label: "secure access", detail: "Loading the team's encrypted login records." } },
  { prefix: "/dashboard", copy: { label: "dashboard", detail: "Loading work that needs attention and recent results." } },
];

export function clientLoadingCopy(pathname: string): ClientLoadingCopy {
  return ROUTE_LOADING_COPY.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.copy ?? {
    label: "workspace",
    detail: "Loading the latest information for this page.",
  };
}

/** Client-facing terms used across onboarding, help and recovery copy. */
export const CLIENT_TERMS = {
  companyProfile: "Company profile",
  companyKnowledge: "Company knowledge",
  companySource: "Company source",
  writingExample: "Writing example",
  learnedPreference: "Learned preference",
  contentInProgress: "In-progress content",
  draft: "Draft",
  competitorContent: "Collected competitor content",
} as const;
