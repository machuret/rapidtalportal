export const CLIENT_EXPERIENCE_EVENTS = [
  "page_ready",
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

/**
 * Records navigation quality without ever blocking the client's work. The API
 * owns authentication, tenant attribution and durable storage; callers only
 * provide non-sensitive route timing metadata.
 */
export function reportClientExperience(input: ClientExperienceEventInput): void {
  try {
    void fetch("/api/experience/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
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
