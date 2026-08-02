import {
  COACH_TOOL_RESULT_MAX_CHARS,
  executeCoachTool,
  persistCoachToolCallLog,
  runCoachToolLoop,
} from "../_shared/coach-tools.ts";
import type { BrainContextV1 } from "../_shared/brain-context.ts";

const CLIENT_ID = "client-1";
const VA_ID = "va-1";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertIncludes(haystack: string[], needle: string): void {
  assert(
    haystack.some((entry) => entry.includes(needle)),
    `expected a recorded call containing "${needle}", got: ${haystack.join(" | ")}`,
  );
}

const fakeEmbed = (_query: string): Promise<number[]> =>
  Promise.resolve(new Array(384).fill(0.01) as number[]);

type MockAdminOptions = {
  tables?: Record<string, Array<Record<string, unknown>>>;
  rpc?: Record<string, Array<Record<string, unknown>>>;
};

/**
 * Chainable stand-in for the service-role client: every filter is recorded so
 * tests can prove tenant/role scoping, and the chain is awaitable at any
 * point, resolving like a PostgREST response.
 */
function createMockAdmin(options: MockAdminOptions) {
  const recorded: string[] = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  // deno-lint-ignore no-explicit-any
  const admin = {
    from(table: string) {
      recorded.push(`from:${table}`);
      const data = options.tables?.[table] ?? [];
      // deno-lint-ignore no-explicit-any
      const chain: any = {};
      chain.select = () => chain;
      chain.eq = (column: string, value: unknown) => {
        recorded.push(`${table}.eq:${column}=${String(value)}`);
        return chain;
      };
      chain.in = (column: string, values: unknown) => {
        recorded.push(`${table}.in:${column}=${JSON.stringify(values)}`);
        return chain;
      };
      chain.or = (expr: string) => {
        recorded.push(`${table}.or:${expr}`);
        return chain;
      };
      chain.order = () => chain;
      chain.limit = (n: number) => {
        recorded.push(`${table}.limit:${n}`);
        return chain;
      };
      chain.update = (payload: Record<string, unknown>) => {
        updates.push({ table, payload });
        return chain;
      };
      chain.then = (resolve: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(resolve({ data, error: null }));
      return chain;
    },
    rpc(name: string, params: Record<string, unknown>) {
      recorded.push(`rpc:${name}:${
        JSON.stringify(params, (key, value) =>
          key === "p_query_embedding"
            ? `vec(${Array.isArray(value) ? value.length : 0})`
            : value)
      }`);
      return Promise.resolve({ data: options.rpc?.[name] ?? [], error: null });
    },
  };
  return { admin, recorded, updates };
}

Deno.test("search_tasks scopes a VA to their own tenant and own assignments only", async () => {
  const { admin, recorded } = createMockAdmin({
    tables: {
      tasks: [
        { id: "task-1", title: "Draft newsletter", status: "todo", due_date: null, priority: 2, assigned_to: VA_ID },
      ],
      users: [{ id: VA_ID, full_name: "Vee", email: "vee@example.com", role: "va" }],
    },
  });
  const result = await executeCoachTool({
    admin,
    clientId: CLIENT_ID,
    actor: { userId: VA_ID, coachRole: "va" },
    name: "search_tasks",
    toolArgs: { query: "newsletter" },
    embed: fakeEmbed,
  });
  assertIncludes(recorded, `tasks.eq:client_id=${CLIENT_ID}`);
  assertIncludes(recorded, `tasks.eq:assigned_to=${VA_ID}`);
  assertIncludes(recorded, "tasks.limit:10");
  assert(result.entry.ok, "search_tasks entry ok");
  assert(result.entry.rowCount === 1, "one task row logged");
  assert(result.entry.ids.includes("task-1"), "task id logged for provenance");

  // A client actor searches company-wide but still inside the same tenant.
  const clientRun = createMockAdmin({ tables: { tasks: [], users: [] } });
  await executeCoachTool({
    admin: clientRun.admin,
    clientId: CLIENT_ID,
    actor: { userId: "client-user-1", coachRole: "client" },
    name: "search_tasks",
    toolArgs: { query: "newsletter", status: "in_progress" },
    embed: fakeEmbed,
  });
  assertIncludes(clientRun.recorded, `tasks.eq:client_id=${CLIENT_ID}`);
  assertIncludes(clientRun.recorded, "tasks.eq:status=in_progress");
  assert(
    !clientRun.recorded.some((entry) => entry.startsWith("tasks.eq:assigned_to")),
    "client actor must not be restricted to an assignee",
  );
});

Deno.test("get_team gives a VA the resolver's reduced team view", async () => {
  const { admin, recorded } = createMockAdmin({
    tables: {
      users: [
        { id: "admin-1", full_name: "Ada", email: "ada@example.com", role: "client_admin" },
        { id: VA_ID, full_name: "Vee", email: "vee@example.com", role: "va" },
      ],
    },
  });
  const result = await executeCoachTool({
    admin,
    clientId: CLIENT_ID,
    actor: { userId: VA_ID, coachRole: "va" },
    name: "get_team",
    toolArgs: {},
    embed: fakeEmbed,
  });
  assertIncludes(recorded, `users.eq:client_id=${CLIENT_ID}`);
  assertIncludes(recorded, `users.or:role.eq.client_admin,id.eq.${VA_ID}`);
  assert(result.entry.rowCount === 2, "both visible members returned");
  const payload = JSON.parse(result.content) as { team: Array<{ name: string; role: string }> };
  assert(payload.team.length === 2, "team payload carries both members");
});

Deno.test("search_vault applies the resolver's Vault governance filters", async () => {
  const { admin, recorded } = createMockAdmin({
    rpc: {
      match_vault_chunks: [
        { id: "chunk-1", item_id: "item-1", content: "Refunds are available within 30 days.", similarity: 0.9 },
      ],
    },
    tables: { vault_items: [{ id: "item-1", title: "Refund policy" }] },
  });
  const result = await executeCoachTool({
    admin,
    clientId: CLIENT_ID,
    actor: { userId: "client-user-1", coachRole: "client" },
    name: "search_vault",
    toolArgs: { query: "refund policy" },
    embed: fakeEmbed,
  });
  assertIncludes(recorded, `rpc:match_vault_chunks:{"p_client_id":"${CLIENT_ID}"`);
  assertIncludes(recorded, `"p_match_count":6`);
  // The title fetch re-applies the same governance boundary as the resolver.
  assertIncludes(recorded, `vault_items.eq:client_id=${CLIENT_ID}`);
  assertIncludes(recorded, "vault_items.eq:status=ready");
  assertIncludes(recorded, "vault_items.eq:evidence_role=factual");
  assertIncludes(recorded, "vault_items.eq:knowledge_status=active");
  assertIncludes(recorded, "vault_items.eq:has_conflict=false");
  assertIncludes(recorded, "vault_items.or:valid_from.is.null,valid_from.lte.");
  assertIncludes(recorded, "vault_items.or:valid_until.is.null,valid_until.gte.");
  assertIncludes(recorded, "vault_items.or:review_due_at.is.null,review_due_at.gt.");
  assert(result.entry.ok, "search_vault entry ok");
  const payload = JSON.parse(result.content) as { chunks: Array<{ title: string }> };
  assert(payload.chunks.length === 1, "one governed chunk returned");
  assert(payload.chunks[0].title === "Refund policy", "chunk carries the item title");
});

Deno.test("coach tool results are truncated to the compact budget", async () => {
  const bigChunks = Array.from({ length: 6 }, (_, index) => ({
    id: `chunk-${index}`,
    item_id: `item-${index}`,
    content: "x".repeat(2_000),
    similarity: 0.9,
  }));
  const { admin } = createMockAdmin({
    rpc: { match_vault_chunks: bigChunks },
    tables: {
      vault_items: bigChunks.map((chunk) => ({ id: chunk.item_id, title: `Item ${chunk.item_id}` })),
    },
  });
  const result = await executeCoachTool({
    admin,
    clientId: CLIENT_ID,
    actor: { userId: "client-user-1", coachRole: "client" },
    name: "search_vault",
    toolArgs: { query: "anything" },
    embed: fakeEmbed,
  });
  assert(
    result.content.length <= COACH_TOOL_RESULT_MAX_CHARS,
    `tool result fits the ${COACH_TOOL_RESULT_MAX_CHARS}-char budget (got ${result.content.length})`,
  );
  assert(result.entry.truncated, "oversized result is flagged as truncated");
  const payload = JSON.parse(result.content) as { chunks: unknown[] };
  assert(payload.chunks.length < 6, "trailing chunks are dropped to fit the budget");
  assert(payload.chunks.length >= 1, "at least one chunk survives");
});

/** A fetch mock that forces tool-call rounds while tools are offered. */
function createToolForcingFetch(bodies: Array<Record<string, unknown>>): typeof fetch {
  return ((_input: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
    bodies.push(body);
    if (Array.isArray(body.tools)) {
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: `call_${bodies.length}`,
              type: "function",
              function: { name: "get_team", arguments: "{}" },
            }],
          },
        }],
        usage: { total_tokens: 12 },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "The final grounded answer." } }],
      usage: { total_tokens: 40 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as unknown as typeof fetch;
}

Deno.test("the tool loop stops after 3 forced tool-call rounds and the tools-less final call answers", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImpl = createToolForcingFetch(bodies);
  const { admin } = createMockAdmin({
    tables: { users: [{ id: "admin-1", full_name: "Ada", email: "ada@example.com", role: "client_admin" }] },
  });
  const loop = await runCoachToolLoop({
    admin,
    clientId: CLIENT_ID,
    actor: { userId: "client-user-1", coachRole: "client" },
    openrouterKey: "test-key",
    model: "openai/gpt-4o-mini",
    maxTokens: 550,
    messages: [
      { role: "system", content: "system" },
      { role: "user", content: "CONTEXT:\n...\n\nQUESTION: who is on the team?" },
    ],
    embed: fakeEmbed,
    fetchImpl,
  });
  // The mock would keep requesting tools forever (5+ rounds); the loop caps at 3.
  assert(loop.answer === null, "no direct answer when the cap is exhausted");
  assert(loop.iterations === 3, "exactly 3 iterations ran");
  assert(bodies.length === 3, "exactly 3 model calls ran inside the loop");
  assert(
    bodies.every((body) => Array.isArray(body.tools)),
    "every loop call offered the tools",
  );
  assert(loop.log.length === 3, "one tool log entry per round");
  assert(
    loop.log.every((entry) => entry.tool === "get_team" && entry.ok),
    "every executed call is logged with tool and status",
  );
  const toolMessages = loop.messages.filter((message) => message.role === "tool");
  assert(toolMessages.length === 3, "tool results were appended to the conversation");

  // The caller then forces the answer through its existing tools-less call.
  const finalRes = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "openai/gpt-4o-mini", messages: loop.messages }),
  });
  const finalJson = await finalRes.json() as { choices: Array<{ message: { content: string } }> };
  assert(bodies.length === 4, "the forced final call is the 4th model call");
  assert(!("tools" in bodies[3]), "the forced final call omits tools");
  assert(
    finalJson.choices[0].message.content === "The final grounded answer.",
    "the answer is produced after the 3rd capped round",
  );
});

Deno.test("the tool loop returns the model's direct answer without tool calls", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImpl = ((_input: unknown, init?: { body?: string }) => {
    bodies.push(JSON.parse(init?.body ?? "{}") as Record<string, unknown>);
    return Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "Refund window is 30 days." } }],
      usage: { total_tokens: 55 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as unknown as typeof fetch;
  const { admin } = createMockAdmin({});
  const loop = await runCoachToolLoop({
    admin,
    clientId: CLIENT_ID,
    actor: { userId: "client-user-1", coachRole: "client" },
    openrouterKey: "test-key",
    model: "openai/gpt-4o-mini",
    maxTokens: 550,
    messages: [{ role: "system", content: "system" }, { role: "user", content: "q" }],
    embed: fakeEmbed,
    fetchImpl,
  });
  assert(loop.answer !== null, "direct answer returned");
  assert(loop.answer?.content === "Refund window is 30 days.", "answer content passed through");
  assert(loop.answer?.usage === 55, "token usage accumulated");
  assert(bodies.length === 1, "one model call when no tools are needed");
  assert(loop.log.length === 0, "no tool calls logged");
  assert(loop.messages.length === 2, "conversation untouched without tool calls");
});

Deno.test("the tool log persists into the snapshot meta envelope, not the validated payload", async () => {
  const { admin, updates } = createMockAdmin({});
  const context = {
    version: "brain-context-v1",
    clientId: CLIENT_ID,
    request: { surface: "ask", marker: "keep-me" },
  } as unknown as BrainContextV1;
  await persistCoachToolCallLog({
    admin,
    snapshotId: "snapshot-1",
    context,
    model: "openai/gpt-4o-mini",
    iterations: 1,
    log: [{
      tool: "search_tasks",
      args: { query: "newsletter" },
      ok: true,
      rowCount: 2,
      ids: ["task-1", "task-2"],
      truncated: false,
      durationMs: 12,
      at: "2026-08-02T00:00:00.000Z",
    }],
  });
  assert(updates.length === 1, "one follow-up update issued");
  assert(updates[0].table === "brain_context_snapshots", "the snapshot row is updated");
  const snapshot = updates[0].payload.snapshot as Record<string, unknown>;
  const meta = snapshot.meta as {
    coach_tools: { version: number; model: string; iterations: number; calls: Array<{ tool: string; rowCount: number }> };
  };
  assert(meta.coach_tools.version === 1, "meta carries the tool-log version");
  assert(meta.coach_tools.calls.length === 1, "meta carries the tool call");
  assert(meta.coach_tools.calls[0].tool === "search_tasks", "tool name logged");
  assert(meta.coach_tools.calls[0].rowCount === 2, "row count logged");
  // The validated context payload is untouched: meta is an envelope sibling.
  assert(snapshot.version === "brain-context-v1", "payload version preserved");
  assert(
    JSON.stringify(snapshot.request) === JSON.stringify(context.request),
    "payload request preserved byte-for-byte",
  );
});
