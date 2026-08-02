/**
 * coach-tools — bounded READ-ONLY tools for the vault-ask Coach loop.
 *
 * The concise and deep Coach answer paths may run a short tool-use loop: the
 * model can call up to three read-only lookups, then answers from what it
 * gathered. Action modes never use tools — Coach writes stay on the existing
 * draft-and-confirm path.
 *
 * SECURITY: every lookup runs through the service-role admin client but is
 * strictly tenant-scoped in code (client_id on every query) and role-scoped
 * exactly like the official Brain resolver — a VA only ever sees its own
 * assigned tasks and a reduced team view, never other tenants' data.
 *
 * PROVENANCE: every executed call is logged (tool, args, result row count,
 * timestamps) so the tool log can be persisted into the context snapshot's
 * meta envelope — what the answer was based on must stay provable, including
 * tool lookups. The log lives outside the validated brain-context-v1 payload.
 */

import type { BrainContextV1 } from "./brain-context.ts";

export interface CoachToolActor {
  userId: string;
  coachRole: "client" | "va";
}

export interface CoachToolCallLogEntry {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  rowCount: number;
  ids: string[];
  truncated: boolean;
  durationMs: number;
  at: string;
  error?: string;
}

export type CoachChatMessage = Record<string, unknown>;

export const COACH_TOOL_RESULT_MAX_CHARS = 4_000;
export const COACH_TOOL_MAX_ITERATIONS = 3;
export const COACH_TOOL_CALL_TIMEOUT_MS = 30_000;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TASK_STATUSES = new Set(["todo", "in_progress", "review", "done"]);
/** A single model round may execute at most this many tool calls. */
const MAX_TOOL_CALLS_PER_ROUND = 3;

/**
 * Appended to the Coach system prompt only when the read-only tools are
 * offered (private concise/deep answers). The admin-editable prompt and the
 * mandatory Brain policy above it are unchanged.
 */
export const COACH_TOOL_ADDENDUM =
  `READ-ONLY LOOKUP TOOLS: you may call the search_tasks, search_vault and get_team tools when the supplied CONTEXT does not contain a needed current detail. They only read data you are already permitted to see and they cannot change anything. If the CONTEXT already answers the question, answer directly without calling a tool.`;

export const COACH_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "search_tasks",
      description:
        "Search this company's current tasks by keyword. Use when the supplied context lacks a needed task detail (status, due date, priority, assignee). Read-only; a virtual assistant only sees its own assigned tasks.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", description: "Keywords matched against the task title and brief." },
          status: {
            type: "string",
            enum: ["todo", "in_progress", "review", "done"],
            description: "Optional exact status filter.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_vault",
      description:
        "Semantically search this company's governed Vault knowledge for a specific fact that is not already in the supplied context. Read-only.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", description: "What to look up, in natural language." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_team",
      description:
        "List this company's team members (name and role) visible to the authenticated speaker. Use for assignee or ownership questions. Read-only.",
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  },
];

interface ToolExec {
  content: string;
  rowCount: number;
  ids: string[];
  truncated: boolean;
}

interface TaskToolRow {
  id: string;
  title: string | null;
  status: string;
  due_date: string | null;
  priority: number;
  assigned_to: string | null;
}

interface UserToolRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
}

interface VaultChunkToolRow {
  id: string;
  item_id: string;
  content: string;
  similarity: number;
}

function compactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const compacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args).slice(0, 10)) {
    compacted[key] = typeof value === "string" ? value.slice(0, 200) : value;
  }
  return compacted;
}

/**
 * PostgREST's or() uses commas, dots and parentheses structurally, and LIKE
 * treats % and _ as wildcards — strip them from user-derived keywords so the
 * filter string cannot be broken open. Tenant scoping never depends on this;
 * it is purely query hygiene.
 */
function likeSafe(value: string): string {
  return value
    .replace(/[().,"\\%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Fits a compact JSON payload into the per-tool character budget by dropping
 * trailing items, with a hard slice as the last resort. Per-item text is
 * capped at source, so trimming only fires on pathological rows.
 */
function fitItems<T>(
  items: T[],
  build: (kept: T[]) => unknown,
): { content: string; delivered: number; truncated: boolean } {
  const kept = [...items];
  let truncated = false;
  let content = JSON.stringify(build(kept));
  while (kept.length > 1 && content.length > COACH_TOOL_RESULT_MAX_CHARS) {
    kept.pop();
    truncated = true;
    content = JSON.stringify(build(kept));
  }
  if (content.length > COACH_TOOL_RESULT_MAX_CHARS) {
    content = content.slice(0, COACH_TOOL_RESULT_MAX_CHARS);
    truncated = true;
  }
  return { content, delivered: kept.length, truncated };
}

// deno-lint-ignore no-explicit-any
async function searchTasks(
  // deno-lint-ignore no-explicit-any
  admin: any,
  clientId: string,
  actor: CoachToolActor,
  toolArgs: Record<string, unknown>,
): Promise<ToolExec> {
  const keyword = likeSafe(typeof toolArgs.query === "string" ? toolArgs.query : "");
  const status = typeof toolArgs.status === "string" && TASK_STATUSES.has(toolArgs.status)
    ? toolArgs.status
    : null;
  let query = admin
    .from("tasks")
    .select("id,title,status,due_date,priority,assigned_to")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (actor.coachRole === "va") query = query.eq("assigned_to", actor.userId);
  if (status) query = query.eq("status", status);
  if (keyword) query = query.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%`);
  const { data, error } = await query;
  if (error) throw new Error(`search_tasks failed: ${error.message}`);
  const rows = (data ?? []) as TaskToolRow[];

  const assigneeIds = Array.from(
    new Set(rows.map((row) => row.assigned_to).filter((id): id is string => Boolean(id))),
  );
  const nameById = new Map<string, string>();
  if (assigneeIds.length) {
    const { data: users, error: usersError } = await admin
      .from("users")
      .select("id,full_name,email")
      .eq("client_id", clientId)
      .in("id", assigneeIds);
    if (usersError) throw new Error(`search_tasks assignees failed: ${usersError.message}`);
    for (const user of (users ?? []) as Array<Pick<UserToolRow, "id" | "full_name" | "email">>) {
      nameById.set(user.id, (user.full_name || user.email || "").slice(0, 120));
    }
  }

  const items = rows.map((row) => ({
    id: row.id,
    title: (row.title ?? "").slice(0, 200),
    status: row.status,
    dueDate: row.due_date,
    priority: row.priority,
    assignee: row.assigned_to ? nameById.get(row.assigned_to) ?? null : null,
  }));
  const fit = fitItems(items, (kept) => ({ tasks: kept, count: kept.length }));
  return {
    content: fit.content,
    rowCount: fit.delivered,
    ids: items.slice(0, fit.delivered).map((item) => item.id),
    truncated: fit.truncated,
  };
}

// deno-lint-ignore no-explicit-any
async function searchVault(
  // deno-lint-ignore no-explicit-any
  admin: any,
  clientId: string,
  toolArgs: Record<string, unknown>,
  embed: (query: string) => Promise<number[]>,
): Promise<ToolExec> {
  const query = typeof toolArgs.query === "string" ? toolArgs.query.trim().slice(0, 300) : "";
  if (!query) {
    return {
      content: JSON.stringify({ chunks: [], note: "A non-empty query is required." }),
      rowCount: 0,
      ids: [],
      truncated: false,
    };
  }
  const embedding = await embed(query);
  if (!Array.isArray(embedding) || embedding.length !== 384) {
    throw new Error("search_vault embedding unavailable");
  }
  // match_vault_chunks itself enforces the governance boundary (ready /
  // factual / active / no-conflict / validity windows) — migration 117.
  const { data, error } = await admin.rpc("match_vault_chunks", {
    p_client_id: clientId,
    p_query_embedding: embedding,
    p_match_count: 6,
  });
  if (error) throw new Error(`search_vault failed: ${error.message}`);
  const chunks = ((data ?? []) as VaultChunkToolRow[])
    .filter((chunk) => typeof chunk.similarity !== "number" || chunk.similarity >= 0.25)
    .slice(0, 6);

  // Titles are fetched with the same governance filters the official resolver
  // applies, so a chunk whose item no longer qualifies is dropped rather than
  // surfaced — defence in depth behind the RPC's own filters.
  const itemIds = Array.from(new Set(chunks.map((chunk) => chunk.item_id)));
  const titleById = new Map<string, string>();
  if (itemIds.length) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: items, error: itemsError } = await admin
      .from("vault_items")
      .select("id,title")
      .eq("client_id", clientId)
      .in("id", itemIds)
      .eq("status", "ready")
      .eq("evidence_role", "factual")
      .eq("knowledge_status", "active")
      .eq("has_conflict", false)
      .or(`valid_from.is.null,valid_from.lte.${today}`)
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .or(`review_due_at.is.null,review_due_at.gt.${today}`);
    if (itemsError) throw new Error(`search_vault titles failed: ${itemsError.message}`);
    for (const item of (items ?? []) as Array<{ id: string; title: string | null }>) {
      titleById.set(item.id, (item.title ?? "").slice(0, 150));
    }
  }

  const items = chunks
    .filter((chunk) => titleById.has(chunk.item_id))
    .map((chunk) => ({
      itemId: chunk.item_id,
      chunkId: chunk.id,
      title: titleById.get(chunk.item_id),
      excerpt: (chunk.content ?? "").replace(/\s+/g, " ").trim().slice(0, 600),
      similarity: typeof chunk.similarity === "number"
        ? Math.max(0, Math.min(1, Math.round(chunk.similarity * 1000) / 1000))
        : null,
    }));
  const fit = fitItems(items, (kept) => ({ chunks: kept, count: kept.length }));
  return {
    content: fit.content,
    rowCount: fit.delivered,
    ids: items.slice(0, fit.delivered).map((item) => item.itemId),
    truncated: fit.truncated,
  };
}

// deno-lint-ignore no-explicit-any
async function getTeam(
  // deno-lint-ignore no-explicit-any
  admin: any,
  clientId: string,
  actor: CoachToolActor,
): Promise<ToolExec> {
  let query = admin
    .from("users")
    .select("id,full_name,email,role")
    .eq("client_id", clientId)
    .in("role", ["client_admin", "va"])
    .order("full_name", { ascending: true })
    .limit(20);
  // Same reduced team view the resolver gives a VA: client admins plus self.
  if (actor.coachRole === "va") {
    query = query.or(`role.eq.client_admin,id.eq.${actor.userId}`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`get_team failed: ${error.message}`);
  const rows = (data ?? []) as UserToolRow[];
  const items = rows
    .map((row) => ({
      id: row.id,
      name: (row.full_name || row.email || "").slice(0, 120),
      role: row.role,
    }))
    .filter((item) => item.name.length > 0);
  const fit = fitItems(items, (kept) => ({
    team: kept.map((item) => ({ name: item.name, role: item.role })),
    count: kept.length,
  }));
  return {
    content: fit.content,
    rowCount: fit.delivered,
    ids: items.slice(0, fit.delivered).map((item) => item.id),
    truncated: fit.truncated,
  };
}

/**
 * Executes one read-only tool call and returns the compact JSON result for
 * the tool message plus the provenance log entry. Never throws — a failed
 * lookup becomes an error payload the model can answer around.
 */
export async function executeCoachTool(args: {
  // deno-lint-ignore no-explicit-any
  admin: any;
  clientId: string;
  actor: CoachToolActor;
  name: string;
  toolArgs: Record<string, unknown>;
  embed: (query: string) => Promise<number[]>;
}): Promise<{ content: string; entry: CoachToolCallLogEntry }> {
  const startedAt = Date.now();
  const entry: CoachToolCallLogEntry = {
    tool: args.name.slice(0, 60),
    args: compactArgs(args.toolArgs),
    ok: false,
    rowCount: 0,
    ids: [],
    truncated: false,
    durationMs: 0,
    at: new Date(startedAt).toISOString(),
  };
  const finish = () => {
    entry.durationMs = Date.now() - startedAt;
    return entry;
  };
  try {
    let result: ToolExec;
    if (args.name === "search_tasks") {
      result = await searchTasks(args.admin, args.clientId, args.actor, args.toolArgs);
    } else if (args.name === "search_vault") {
      result = await searchVault(args.admin, args.clientId, args.toolArgs, args.embed);
    } else if (args.name === "get_team") {
      result = await getTeam(args.admin, args.clientId, args.actor);
    } else {
      throw new Error(`Unknown coach tool: ${args.name}`);
    }
    entry.ok = true;
    entry.rowCount = result.rowCount;
    entry.ids = result.ids.slice(0, 10);
    entry.truncated = result.truncated;
    return { content: result.content, entry: finish() };
  } catch (error) {
    entry.error = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    return {
      content: JSON.stringify({
        error: "The lookup failed. Answer from the supplied context instead.",
      }),
      entry: finish(),
    };
  }
}

interface LoopCompletion {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: { total_tokens?: number };
}

/**
 * The bounded agentic loop behind the concise/deep Coach answer. Runs at most
 * `maxIterations` non-streaming model calls that may request tool calls; each
 * request carries the three read-only tool definitions and is capped at
 * `perCallTimeoutMs`. Terminates as soon as the model answers with content;
 * on the cap (or any model-call failure) it returns the accumulated messages
 * — tool exchanges included — so the caller can force a final answer through
 * its existing tools-less call. Never throws.
 */
export async function runCoachToolLoop(args: {
  // deno-lint-ignore no-explicit-any
  admin: any;
  clientId: string;
  actor: CoachToolActor;
  openrouterKey: string;
  model: string;
  maxTokens: number;
  messages: CoachChatMessage[];
  embed: (query: string) => Promise<number[]>;
  maxIterations?: number;
  perCallTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{
  messages: CoachChatMessage[];
  answer: { content: string; usage: number } | null;
  log: CoachToolCallLogEntry[];
  iterations: number;
}> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const maxIterations = Math.max(
    1,
    Math.min(args.maxIterations ?? COACH_TOOL_MAX_ITERATIONS, COACH_TOOL_MAX_ITERATIONS),
  );
  const timeoutMs = args.perCallTimeoutMs ?? COACH_TOOL_CALL_TIMEOUT_MS;
  const messages: CoachChatMessage[] = [...args.messages];
  const log: CoachToolCallLogEntry[] = [];
  let usageTotal = 0;
  let iterations = 0;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    iterations = iteration + 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response | null = null;
    try {
      res = await fetchImpl(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${args.openrouterKey}`,
          "HTTP-Referer": "https://rapidtal.online",
          "X-Title": "RapidTal Portal",
        },
        body: JSON.stringify({
          model: args.model,
          max_tokens: args.maxTokens,
          temperature: 0.4,
          stream: false,
          tools: COACH_TOOL_DEFINITIONS,
          tool_choice: "auto",
          messages,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      console.warn(
        "vault-ask: coach tool loop model call failed; answering without further tool use",
        error,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res) break;
    if (!res.ok) {
      console.warn(
        `vault-ask: coach tool loop model call returned ${res.status}; answering without further tool use`,
      );
      break;
    }
    let payload: LoopCompletion;
    try {
      payload = await res.json() as LoopCompletion;
    } catch {
      break;
    }
    usageTotal += Number(payload.usage?.total_tokens ?? 0) || 0;
    const message = payload.choices?.[0]?.message;
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    if (!toolCalls.length) {
      const content = typeof message?.content === "string" ? message.content.trim() : "";
      if (content) {
        return { messages, answer: { content, usage: usageTotal }, log, iterations };
      }
      break;
    }

    messages.push({
      role: "assistant",
      content: message?.content ?? null,
      tool_calls: toolCalls,
    });
    for (const [index, call] of toolCalls.entries()) {
      const toolCallId = String(call?.id ?? "");
      if (index >= MAX_TOOL_CALLS_PER_ROUND) {
        // Every tool_call id still needs a tool response, or the next model
        // call is rejected.
        messages.push({
          role: "tool",
          tool_call_id: toolCallId,
          content: JSON.stringify({ error: "Tool budget for this step exceeded." }),
        });
        continue;
      }
      const name = String(call?.function?.name ?? "");
      let toolArgs: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(
          typeof call?.function?.arguments === "string" ? call.function.arguments : "{}",
        );
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          toolArgs = parsed as Record<string, unknown>;
        }
      } catch {
        toolArgs = {};
      }
      const executed = await executeCoachTool({
        admin: args.admin,
        clientId: args.clientId,
        actor: args.actor,
        name,
        toolArgs,
        embed: args.embed,
      });
      log.push(executed.entry);
      messages.push({ role: "tool", tool_call_id: toolCallId, content: executed.content });
    }
  }
  return { messages, answer: null, log, iterations };
}

/**
 * Best-effort provenance follow-up: attaches the tool-call log to the already
 * persisted Brain context snapshot as a top-level `meta` envelope key, next to
 * (never inside) the validated brain-context-v1 payload. The snapshot row is
 * insert-only for the service role today, so a rejected update is logged —
 * with the full tool log — instead of failing the answer.
 */
export async function persistCoachToolCallLog(args: {
  // deno-lint-ignore no-explicit-any
  admin: any;
  snapshotId: string;
  context: BrainContextV1;
  model: string;
  iterations: number;
  log: CoachToolCallLogEntry[];
}): Promise<void> {
  if (!args.log.length) return;
  const meta = {
    coach_tools: {
      version: 1,
      model: args.model,
      iterations: args.iterations,
      calls: args.log,
    },
  };
  try {
    const { error } = await args.admin
      .from("brain_context_snapshots")
      .update({ snapshot: { ...args.context, meta } })
      .eq("id", args.snapshotId);
    if (error) throw error;
  } catch (error) {
    console.warn(
      "vault-ask: coach tool log snapshot meta update unavailable; tool log follows",
      JSON.stringify(meta),
      error,
    );
  }
}
