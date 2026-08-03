export const CLIENT_EXPERIENCE_EVENTS = [
  "page_ready",
  "feature_ready",
  "feature_error",
  "page_slow",
  "page_retry",
  "page_error",
  "navigation_search_opened",
  "navigation_destination_opened",
  "guide_search_used",
  "contextual_help_opened",
] as const;

export type ClientExperienceEvent = (typeof CLIENT_EXPERIENCE_EVENTS)[number];

export interface ClientExperienceEventInput {
  eventType: ClientExperienceEvent;
  path: string;
  targetPath?: string;
  durationMs?: number;
  metadata?: Record<string, string | number | boolean | null>;
  eventId?: string;
  navigationId?: string;
  interactionId?: string;
  attempt?: number;
}

interface NavigationContext {
  id: string;
  path: string;
  startedAt: number;
  attempt: number;
}

const NAVIGATION_CONTEXT_KEY = "rapidtal:navigation-context";
const EXPERIENCE_QUEUE_PREFIX = "rapidtal:experience-queue:";
const MAX_EXPERIENCE_BATCH = 20;
let experienceActorId: string | null = null;
let flushTimer: number | null = null;
let flushInFlight = false;
let deliveryFailures = 0;
let deliveryListenersRegistered = false;
let volatileExperienceQueue: QueuedClientExperienceEvent[] = [];
let volatileExperienceQueueKey = `${EXPERIENCE_QUEUE_PREFIX}pending`;

type QueuedClientExperienceEvent = ClientExperienceEventInput & {
  eventId: string;
  navigationId?: string;
  interactionId?: string;
  attempt: number;
};

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

/** Scope the retry queue to the signed-in actor so a shared browser session
 * can never submit a previous user's pending measurements as the next user. */
export function configureClientExperienceActor(actorId: string): void {
  if (typeof window === "undefined" || !actorId) return;
  const mayMigratePendingQueue = experienceActorId === null;
  const previousKey = queueStorageKey();
  // Only migrate events created by this live page before the layout resolved
  // its actor. Never restore the anonymous/pending key from sessionStorage:
  // it may belong to a previous login in the same browser tab.
  const livePending = mayMigratePendingQueue && volatileExperienceQueueKey === previousKey
    ? [...volatileExperienceQueue]
    : [];
  experienceActorId = actorId;
  const nextKey = queueStorageKey();
  if (mayMigratePendingQueue && previousKey !== nextKey) {
    const actorQueue = readExperienceQueue(nextKey);
    writeExperienceQueue([...actorQueue, ...livePending].slice(-200), nextKey);
    try { sessionStorage.removeItem(previousKey); } catch { /* optional storage */ }
  }
  registerDeliveryListeners();
  scheduleExperienceFlush();
}

/** Starts the target navigation before recording the selection. The resulting
 * interaction/navigation ID is then reused by page_ready or page_error on the
 * destination, making search-to-loaded conversion measurable. */
export function reportClientDestination(input: {
  sourcePath: string;
  targetPath: string;
  source: "command_palette_search" | "command_palette_goal" | "command_palette_no_match" | "guide_goal" | "guide_article";
  queryTokenCount?: number;
  resultCount?: number;
  resultKind?: "destination" | "task" | "notebook" | "knowledge" | "draft" | "project" | "competitor" | "lead" | "contact";
}): void {
  const targetPath = clientRoutePath(input.targetPath);
  const navigation = beginClientNavigation(targetPath, Date.now(), true);
  reportClientExperience({
    eventType: "navigation_destination_opened",
    path: input.sourcePath,
    targetPath,
    navigationId: navigation.id,
    interactionId: navigation.id,
    attempt: navigation.attempt,
    metadata: {
      source: input.source,
      query_token_count: input.queryTokenCount ?? 0,
      result_count: input.resultCount ?? 1,
      result_kind: input.resultKind ?? "destination",
    },
  });
}

export function clientRoutePath(value: string): string {
  try {
    return new URL(value, typeof window === "undefined" ? "https://portal.invalid" : window.location.origin).pathname;
  } catch {
    return value.split(/[?#]/u, 1)[0] || "/";
  }
}

/**
 * Records navigation quality without ever blocking the client's work. The API
 * owns authentication, tenant attribution and durable storage; callers only
 * provide non-sensitive route timing metadata.
 */
export function reportClientExperience(input: ClientExperienceEventInput): void {
  try {
    if (typeof window === "undefined") return;
    const navigation = input.navigationId ? null : ensureClientNavigation(input.path);
    const event: QueuedClientExperienceEvent = {
      ...input,
      eventId: input.eventId ?? crypto.randomUUID(),
      navigationId: input.navigationId ?? navigation?.id,
      interactionId: input.interactionId,
      attempt: input.attempt ?? navigation?.attempt ?? 0,
    };
    const key = queueStorageKey();
    writeExperienceQueue([...readExperienceQueue(key), event].slice(-200), key);
    registerDeliveryListeners();
    scheduleExperienceFlush();
  } catch {
    // Measurement must never make the portal harder to use.
  }
}

function queueStorageKey() {
  return `${EXPERIENCE_QUEUE_PREFIX}${experienceActorId ?? "pending"}`;
}

function readExperienceQueue(key = queueStorageKey()): QueuedClientExperienceEvent[] {
  if (typeof window === "undefined") return key === volatileExperienceQueueKey ? volatileExperienceQueue : [];
  if (experienceActorId === null && key === `${EXPERIENCE_QUEUE_PREFIX}pending`) {
    return key === volatileExperienceQueueKey ? volatileExperienceQueue : [];
  }
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) ?? "[]") as unknown;
    volatileExperienceQueue = Array.isArray(parsed) ? parsed as QueuedClientExperienceEvent[] : [];
    volatileExperienceQueueKey = key;
    return volatileExperienceQueue;
  } catch { return key === volatileExperienceQueueKey ? volatileExperienceQueue : []; }
}

function writeExperienceQueue(events: QueuedClientExperienceEvent[], key = queueStorageKey()) {
  volatileExperienceQueue = events;
  volatileExperienceQueueKey = key;
  if (experienceActorId === null && key === `${EXPERIENCE_QUEUE_PREFIX}pending`) return;
  try { sessionStorage.setItem(key, JSON.stringify(events)); } catch { /* optional storage */ }
}

function scheduleExperienceFlush(delay = 0) {
  if (typeof window === "undefined" || flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushClientExperienceEvents();
  }, delay);
}

export async function flushClientExperienceEvents(): Promise<void> {
  if (typeof window === "undefined" || flushInFlight) return;
  const key = queueStorageKey();
  const batch = readExperienceQueue(key).slice(0, MAX_EXPERIENCE_BATCH);
  if (!batch.length) return;
  flushInFlight = true;
  try {
    const response = await fetch("/api/experience/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
    const delivered = new Set(batch.map((event) => event.eventId));
    if (!response.ok) {
      // A rejected legacy/invalid payload will never succeed on retry. Remove
      // it so one stale event cannot block every newer measurement; 429 and
      // server/network failures remain queued.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        writeExperienceQueue(readExperienceQueue(key).filter((event) => !delivered.has(event.eventId)), key);
        deliveryFailures = 0;
        if (readExperienceQueue(key).length) scheduleExperienceFlush();
        return;
      }
      throw new Error(`Experience delivery failed (${response.status}).`);
    }
    writeExperienceQueue(readExperienceQueue(key).filter((event) => !delivered.has(event.eventId)), key);
    deliveryFailures = 0;
    if (readExperienceQueue(key).length) scheduleExperienceFlush();
  } catch {
    deliveryFailures += 1;
    scheduleExperienceFlush(Math.min(30_000, 1_000 * (2 ** Math.min(deliveryFailures, 5))));
  } finally {
    flushInFlight = false;
  }
}

function registerDeliveryListeners() {
  if (typeof window === "undefined" || deliveryListenersRegistered) return;
  deliveryListenersRegistered = true;
  window.addEventListener("online", () => scheduleExperienceFlush());
  window.addEventListener("pagehide", () => {
    const batch = readExperienceQueue().slice(0, MAX_EXPERIENCE_BATCH);
    if (!batch.length || typeof navigator.sendBeacon !== "function") return;
    try {
      navigator.sendBeacon(
        "/api/experience/events",
        new Blob([JSON.stringify({ events: batch })], { type: "application/json" }),
      );
    } catch { /* the confirmed queue remains for the next page */ }
  });
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
