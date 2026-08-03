import type { CoachPageContextKey } from "./coach-page-context.ts";

type QueryResult = { data: Array<Record<string, unknown>> | null; error: unknown };
type QueryLike = PromiseLike<QueryResult>;
type SafeRows = { rows: Array<Record<string, unknown>>; available: boolean };

async function safeRows(query: QueryLike): Promise<SafeRows> {
  try {
    const result = await query;
    return result.error
      ? { rows: [], available: false }
      : { rows: result.data ?? [], available: true };
  } catch {
    return { rows: [], available: false };
  }
}

function statusSummary(label: string, result: SafeRows) {
  if (!result.available) return `${label}: status is temporarily unavailable.`;
  const { rows } = result;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const status = typeof row.status === "string" ? row.status.replaceAll("_", " ") : "unknown";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const values = [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
  return `${label}: ${rows.length} total${values.length ? ` (${values.map(([status, count]) => `${count} ${status}`).join(", ")})` : ""}.`;
}

/**
 * Loads small status-only summaries for workspaces that are not represented
 * fully in the general Brain context. No bodies, notes, contact details,
 * credentials or scraped content enter the prompt. Every query is constrained
 * by the already-authorised tenant.
 */
export async function loadCoachPageState({
  admin,
  clientId,
  contextKey,
}: {
  // deno-lint-ignore no-explicit-any
  admin: any;
  clientId: string;
  contextKey: CoachPageContextKey;
}): Promise<string[]> {
  if (contextKey === "knowledge") {
    const rows = await safeRows(admin.from("vault_items").select("status").eq("client_id", clientId).limit(500));
    return [statusSummary("Company knowledge sources", rows)];
  }
  if (contextKey === "content") {
    const [projects, pieces] = await Promise.all([
      safeRows(admin.from("content_projects").select("status,current_step").eq("client_id", clientId).limit(300)),
      safeRows(admin.from("content_pieces").select("status").eq("client_id", clientId).limit(300)),
    ]);
    const steps = new Map<string, number>();
    for (const project of projects.rows) {
      const step = typeof project.current_step === "string" ? project.current_step.replaceAll("_", " ") : "unknown";
      steps.set(step, (steps.get(step) ?? 0) + 1);
    }
    return [
      statusSummary("Content projects", projects),
      `Current project steps: ${[...steps.entries()].map(([step, count]) => `${count} ${step}`).join(", ") || "none"}.`,
      statusSummary("Content library", pieces),
    ];
  }
  if (contextKey === "leads") {
    const [campaigns, leads, jobs] = await Promise.all([
      safeRows(admin.from("prospecting_campaigns").select("status").eq("client_id", clientId).is("archived_at", null).limit(300)),
      safeRows(admin.from("prospecting_campaign_leads").select("status").eq("client_id", clientId).limit(500)),
      safeRows(admin.from("prospecting_jobs").select("status,updated_at").eq("client_id", clientId).order("updated_at", { ascending: false }).limit(100)),
    ]);
    return [statusSummary("Lead campaigns", campaigns), statusSummary("Lead Inbox", leads), statusSummary("Recent lead jobs", jobs)];
  }
  if (contextKey === "crm") {
    const rows = await safeRows(admin.from("crm_contacts").select("status").eq("client_id", clientId).is("archived_at", null).limit(500));
    return [statusSummary("CRM contacts", rows)];
  }
  if (contextKey === "competitors") {
    const [competitors, sources, reports] = await Promise.all([
      safeRows(admin.from("competitors").select("status").eq("client_id", clientId).limit(100)),
      safeRows(admin.from("competitor_sources").select("status").eq("client_id", clientId).limit(300)),
      safeRows(admin.from("competitor_intelligence_runs").select("status,updated_at").eq("client_id", clientId).order("updated_at", { ascending: false }).limit(5)),
    ]);
    return [statusSummary("Competitors", competitors), statusSummary("Competitor sources", sources), statusSummary("Intelligence reports", reports)];
  }
  if (contextKey === "voice") {
    const [profiles, goldens] = await Promise.all([
      safeRows(admin.from("content_style_analyses").select("status,channel").eq("client_id", clientId).limit(100)),
      safeRows(admin.from("content_golden_examples").select("status,channel").eq("client_id", clientId).limit(200)),
    ]);
    return [statusSummary("Voice profiles", profiles), statusSummary("Voice examples", goldens)];
  }
  return [];
}
