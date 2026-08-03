import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { createClient } from "@/lib/supabase/server";
import { clientDiscoveryLimiter, tooManyRequests } from "@/lib/rate-limit";
import {
  safeDiscoveryQuery,
  type ClientDiscoveryKind,
  type ClientDiscoveryResponse,
  type ClientDiscoveryResult,
} from "@/lib/discovery/types";

const requestSchema = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(25).default(8),
});

type SearchOutcome<T> = { data: T[] | null; error: unknown };
type RankedDiscoveryResult = ClientDiscoveryResult & { relevance: number };

async function safeSearch<T>(request: PromiseLike<SearchOutcome<T>>): Promise<SearchOutcome<T>> {
  try {
    return await request;
  } catch (error) {
    return { data: null, error };
  }
}

function result(
  id: string,
  kind: ClientDiscoveryKind,
  title: string,
  detail: string,
  status: string | null,
  href: string,
  query: string,
): RankedDiscoveryResult {
  const safeTitle = title.trim() || "Untitled";
  return { id, kind, title: safeTitle, detail, status, href, relevance: matchRelevance(query, `${safeTitle} ${detail}`) };
}

function matchRelevance(query: string, candidate: string) {
  const needle = query.toLocaleLowerCase();
  const value = candidate.toLocaleLowerCase();
  if (value === needle) return 1_000;
  if (value.startsWith(`${needle} `) || value.startsWith(needle)) return 850;
  if (new RegExp(`(^|\\s)${escapeRegExp(needle)}`, "u").test(value)) return 700;
  const position = value.indexOf(needle);
  if (position >= 0) return 550 - Math.min(position, 100);
  const terms = needle.split(/\s+/u).filter(Boolean);
  if (!terms.every((term) => value.includes(term))) return 0;
  return 420 + terms.reduce((score, term) => score + (new RegExp(`(^|\\s)${escapeRegExp(term)}`, "u").test(value) ? 12 : 4), 0);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Searches record titles and identity fields only. It never returns document
 * bodies, notes, task descriptions or draft text. Every tenant table is
 * constrained by the authenticated client and Notebook additionally runs
 * through its participant-only RLS policy using the caller's own session.
 */
export const POST = withAuth(async (request, { user }) => {
  if (!user.client_id) return NextResponse.json<ClientDiscoveryResponse>({ results: [], partial: false, unavailableKinds: [] });
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid search request." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter at least two characters." }, { status: 422 });

  const rate = await clientDiscoveryLimiter.check(`discovery:${user.id}`);
  if (!rate.allowed) return tooManyRequests(rate.retryAfterSeconds);

  const query = safeDiscoveryQuery(parsed.data.q);
  if (query.length < 2) return NextResponse.json({ error: "Enter at least two searchable characters." }, { status: 422 });
  const terms = query.split(/\s+/u).filter(Boolean).slice(0, 6);
  const searchLimit = parsed.data.limit;
  const clientId = user.client_id;
  const db = await createClient();
  const signal = AbortSignal.timeout(5_000);

  let tasksQuery = db.from("tasks").select("id,title,status,updated_at").eq("client_id", clientId).is("archived_at", null);
  let notebookQuery = db.from("notebook_pages").select("id,placement_id,title,updated_at").eq("is_archived", false);
  let knowledgeQuery = db.from("vault_items").select("id,title,status,updated_at").eq("client_id", clientId);
  let draftsQuery = db.from("content_pieces").select("id,title,status,content_type,updated_at").eq("client_id", clientId);
  let projectsQuery = db.from("content_projects").select("id,title,status,current_step,updated_at").eq("client_id", clientId).in("status", ["active", "saved"]);
  let competitorsQuery = db.from("competitors").select("id,name,status,website_url,updated_at").eq("client_id", clientId);
  let contactsQuery = db.from("crm_contacts").select("id,first_name,last_name,company,status,updated_at").eq("client_id", clientId).is("archived_at", null);
  let prospectsQuery = db.from("prospecting_prospects").select("id,company_name,person_name,job_title,locality,last_seen_at").eq("client_id", clientId);
  for (const term of terms) {
    const pattern = `%${term}%`;
    tasksQuery = tasksQuery.ilike("title", pattern);
    notebookQuery = notebookQuery.ilike("title", pattern);
    knowledgeQuery = knowledgeQuery.ilike("title", pattern);
    draftsQuery = draftsQuery.ilike("title", pattern);
    projectsQuery = projectsQuery.ilike("title", pattern);
    competitorsQuery = competitorsQuery.or(`name.ilike.${pattern},website_url.ilike.${pattern}`);
    contactsQuery = contactsQuery.or(`first_name.ilike.${pattern},last_name.ilike.${pattern},company.ilike.${pattern},email.ilike.${pattern}`);
    prospectsQuery = prospectsQuery.or(`company_name.ilike.${pattern},person_name.ilike.${pattern},website_url.ilike.${pattern}`);
  }
  const [tasks, notebook, knowledge, drafts, projects, competitors, contacts, prospects] = await Promise.all([
    safeSearch(tasksQuery.order("updated_at", { ascending: false }).limit(searchLimit).abortSignal(signal)),
    safeSearch(notebookQuery.order("updated_at", { ascending: false }).limit(searchLimit).abortSignal(signal)),
    safeSearch(knowledgeQuery.order("updated_at", { ascending: false }).limit(searchLimit).abortSignal(signal)),
    safeSearch(draftsQuery.order("updated_at", { ascending: false }).limit(searchLimit).abortSignal(signal)),
    safeSearch(projectsQuery.order("updated_at", { ascending: false }).limit(searchLimit).abortSignal(signal)),
    safeSearch(competitorsQuery.order("updated_at", { ascending: false }).limit(searchLimit).abortSignal(signal)),
    safeSearch(contactsQuery.order("updated_at", { ascending: false }).limit(searchLimit).abortSignal(signal)),
    safeSearch(prospectsQuery.order("last_seen_at", { ascending: false }).limit(searchLimit).abortSignal(signal)),
  ]) as unknown as Array<SearchOutcome<Record<string, unknown>>>;

  let leadRows: SearchOutcome<Record<string, unknown>> = { data: [], error: null };
  const prospectIds = (prospects.data ?? []).flatMap((row) => typeof row.id === "string" ? [row.id] : []);
  if (!prospects.error && prospectIds.length) {
    leadRows = await safeSearch(db.from("prospecting_campaign_leads")
      .select("id,prospect_id,status,discovered_at")
      .eq("client_id", clientId)
      .in("prospect_id", prospectIds)
      .order("discovered_at", { ascending: false })
      .limit(searchLimit)
      .abortSignal(signal)) as unknown as SearchOutcome<Record<string, unknown>>;
  }

  const unavailableKinds: ClientDiscoveryKind[] = [];
  const mark = (outcome: SearchOutcome<unknown>, kinds: ClientDiscoveryKind[]) => {
    if (outcome.error) unavailableKinds.push(...kinds);
  };
  mark(tasks, ["task"]);
  mark(notebook, ["notebook"]);
  mark(knowledge, ["knowledge"]);
  mark(drafts, ["draft"]);
  mark(projects, ["project"]);
  mark(competitors, ["competitor"]);
  mark(contacts, ["contact"]);
  mark(prospects.error ? prospects : leadRows, ["lead"]);

  const results: RankedDiscoveryResult[] = [];
  for (const row of tasks.data ?? []) {
    results.push(result(String(row.id), "task", String(row.title ?? ""), "Shared task", String(row.status ?? ""), `/tasks?card=${row.id}`, query));
  }
  for (const row of notebook.data ?? []) {
    results.push(result(String(row.id), "notebook", String(row.title ?? ""), "Shared Notebook page", null, `/notebook?placement=${row.placement_id}&page=${row.id}`, query));
  }
  for (const row of knowledge.data ?? []) {
    results.push(result(String(row.id), "knowledge", String(row.title ?? ""), "Company source", String(row.status ?? ""), `/vault?open=${row.id}&q=${encodeURIComponent(String(row.title ?? ""))}`, query));
  }
  for (const row of drafts.data ?? []) {
    results.push(result(String(row.id), "draft", String(row.title ?? ""), String(row.content_type ?? "Content draft"), String(row.status ?? ""), `/content/library?open=${row.id}`, query));
  }
  for (const row of projects.data ?? []) {
    results.push(result(String(row.id), "project", String(row.title ?? ""), "In-progress content", String(row.current_step ?? row.status ?? ""), `/content/projects?open=${row.id}`, query));
  }
  for (const row of competitors.data ?? []) {
    results.push(result(String(row.id), "competitor", String(row.name ?? ""), String(row.website_url ?? "Competitor"), String(row.status ?? ""), `/competitors#competitor-${row.id}`, query));
  }
  for (const row of contacts.data ?? []) {
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || String(row.company ?? "Contact");
    results.push(result(String(row.id), "contact", name, String(row.company ?? "CRM contact"), String(row.status ?? ""), `/crm?contact=${row.id}`, query));
  }

  const prospectById = new Map((prospects.data ?? []).map((row) => [String(row.id), row]));
  const seenProspects = new Set<string>();
  for (const row of leadRows.data ?? []) {
    const prospectId = String(row.prospect_id ?? "");
    if (!prospectId || seenProspects.has(prospectId)) continue;
    const prospect = prospectById.get(prospectId);
    if (!prospect) continue;
    seenProspects.add(prospectId);
    const name = String(prospect.company_name ?? prospect.person_name ?? "Lead");
    const leadDetail = [prospect.job_title, prospect.locality].filter(Boolean).join(" · ") || "Lead Inbox";
    results.push(result(String(row.id), "lead", name, leadDetail, String(row.status ?? ""), `/lead-generation?lead=${row.id}`, query));
  }

  results.sort((left, right) => right.relevance - left.relevance || left.title.localeCompare(right.title));
  const publicResults = results.filter((entry) => entry.relevance > 0).slice(0, 60).map(({ id, kind, title, detail, status, href }) => ({
    id, kind, title, detail, status, href,
  }));

  return NextResponse.json<ClientDiscoveryResponse>({
    results: publicResults,
    partial: unavailableKinds.length > 0,
    unavailableKinds: [...new Set(unavailableKinds)],
  });
});
