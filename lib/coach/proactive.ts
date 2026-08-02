/**
 * Proactive Coach — the "draft-and-confirm" loop that lets the Coach initiate.
 *
 * Once a week (cron `/api/cron/coach-proactive`) this resolves the official
 * Brain context FOR a specific user, scans it for deterministic triggers
 * (overdue / unassigned / due-soon / awaiting-review work), and — only when
 * something genuinely needs attention — drafts ONE suggested action. It then
 * writes, in order:
 *
 *   1. an immutable context snapshot (createdBy = the target user),
 *   2. a `coach_action_previews` row (server-authored, exactly like the
 *      interactive vault-ask path — the browser can never create these),
 *   3. a `coach_turns` row with `origin = 'proactive'` carrying the rationale
 *      and the draft, so it renders in the user's normal Coach history,
 *   4. a notification pointing at /ask.
 *
 * The human confirms or edits through the unchanged `/api/coach/actions`
 * execution path (receipts, idempotency, DB role checks). Nothing here
 * executes anything — the confirmation boundary is the load-bearing design.
 *
 * Hard rules:
 * - Never invent IDs: assignee/task IDs are validated against the resolved
 *   context's team/task lists; an unmatched draft is dropped, not guessed.
 * - No noise: zero triggers → zero writes. One proactive turn per owner per
 *   PROACTIVE_INTERVAL_DAYS, enforced by the origin-tagged dedupe lookup.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { resolveNodeBrainContext, persistNodeBrainContextSnapshot } from "@/lib/brain/resolver";
import { evaluateCoachQuality } from "@/lib/brain/coach-quality-gate";
import { chatProvider, chatModel } from "@/lib/brain/llm";
import { notify } from "@/lib/notifications";

type Admin = SupabaseClient;

export const PROACTIVE_INTERVAL_DAYS = 7;

const CLIENT_PERMISSIONS = [
  "read_company_status", "create_tasks", "assign_tasks", "approve_work", "message_va_team",
] as const;

/** One suggested action, mirroring the interactive preview payload shapes. */
const draftSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    title: z.string().trim().min(1).max(300),
    brief: z.string().max(10000).default(""),
    assigneeId: z.string().uuid().nullable().default(null),
    priority: z.number().int().min(1).max(4).default(3),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  }),
  z.object({
    type: z.literal("update_task"),
    taskId: z.string().uuid(),
    status: z.enum(["todo", "in_progress", "review", "done"]).optional(),
    priority: z.number().int().min(1).max(4).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    note: z.string().max(2000).default(""),
  }),
]);

const llmResponseSchema = z.object({
  answer: z.string().trim().min(1).max(4000),
  draft: draftSchema.nullable().default(null),
});

export type ProactiveDraft = z.infer<typeof draftSchema>;

export type ProactiveTriggers = {
  overdue: number;
  dueThisWeek: number;
  unassigned: number;
  awaitingReview: number;
};

type ContextTask = {
  taskId: string;
  title: string;
  status: string;
  dueDate: string | null;
  priority: number;
  assignedTo: string | null;
  assignedName: string | null;
};

type ContextTeamMember = { userId: string; displayName: string; role: string };

/** Deterministic attention scan over the resolved operational context. */
export function scanProactiveTriggers(tasks: ContextTask[], today: string): ProactiveTriggers {
  const weekOut = new Date(Date.parse(today + "T00:00:00Z") + 7 * 86_400_000).toISOString().slice(0, 10);
  const active = tasks.filter((t) => t.status === "todo" || t.status === "in_progress");
  return {
    overdue: active.filter((t) => t.dueDate && t.dueDate < today).length,
    dueThisWeek: active.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekOut).length,
    unassigned: active.filter((t) => !t.assignedTo).length,
    awaitingReview: tasks.filter((t) => t.status === "review").length,
  };
}

export function hasTriggers(t: ProactiveTriggers): boolean {
  return t.overdue + t.dueThisWeek + t.unassigned + t.awaitingReview > 0;
}

/**
 * Server-side "never invent IDs" enforcement: a draft may only reference the
 * team members and tasks the resolver actually supplied. Returns null when
 * the draft references anything else (it is dropped, never executed).
 */
export function validateDraftAgainstContext(
  draft: ProactiveDraft,
  team: ContextTeamMember[],
  tasks: ContextTask[],
): ProactiveDraft | null {
  if (draft.type === "create_task") {
    if (draft.assigneeId && !team.some((m) => m.userId === draft.assigneeId)) return null;
    return draft;
  }
  if (!tasks.some((t) => t.taskId === draft.taskId)) return null;
  return draft;
}

async function composeProactiveAnswer(
  context: { prompt: string },
  triggers: ProactiveTriggers,
  tasks: ContextTask[],
  team: ContextTeamMember[],
): Promise<{ answer: string; draft: ProactiveDraft | null } | { error: string }> {
  const llm = chatProvider();
  if (!llm) return { error: "no_llm_provider" };

  const taskLines = tasks.slice(0, 25).map((t) =>
    `- id=${t.taskId} "${t.title}" status=${t.status} due=${t.dueDate ?? "none"} priority=${t.priority} assignee=${t.assignedName ?? "unassigned"}${t.assignedTo ? ` (${t.assignedTo})` : ""}`,
  ).join("\n");
  const teamLines = team.map((m) => `- id=${m.userId} ${m.displayName} (${m.role})`).join("\n");

  const userPrompt = [
    `This week's attention scan found: ${triggers.overdue} overdue, ${triggers.dueThisWeek} due within 7 days, ${triggers.unassigned} unassigned, ${triggers.awaitingReview} awaiting review.`,
    "",
    "Operational tasks (the ONLY tasks you may reference):",
    taskLines || "(none)",
    "",
    "Team (the ONLY people you may assign to):",
    teamLines || "(none)",
    "",
    "Brain context:",
    context.prompt.slice(0, 16_000),
  ].join("\n");

  let res: Response;
  try {
    res = await fetch(llm.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.key}` },
      body: JSON.stringify({
        model: chatModel("COACH_PROACTIVE_MODEL"),
        temperature: 0.3,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are RapidTal Coach writing a short proactive weekly note to a client admin.",
              "Summarise what needs attention in 2-4 plain sentences, specific and human.",
              "Then, if ONE action would clearly help, include a draft for it — otherwise null.",
              "Rules: reference only the listed task/team IDs; never invent IDs, people, or tasks;",
              "prefer update_task for existing work over create_task; no pressure language;",
              "the human will review your draft before anything happens — write for that.",
              'Return JSON: {"answer": string, "draft": object|null}.',
            ].join(" "),
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (e) {
    console.error("[coach/proactive] llm fetch", e);
    return { error: "llm_unreachable" };
  }
  if (!res.ok) {
    console.error("[coach/proactive] llm", llm.provider, res.status);
    return { error: "llm_failed" };
  }

  try {
    const raw = JSON.parse((await res.json()).choices?.[0]?.message?.content ?? "{}");
    const parsed = llmResponseSchema.safeParse(raw);
    if (!parsed.success) return { error: "llm_bad_shape" };
    return { answer: parsed.data.answer, draft: parsed.data.draft };
  } catch {
    return { error: "llm_unparseable" };
  }
}

export type ProactiveRunResult = {
  clientsConsidered: number;
  ownersConsidered: number;
  suggested: number;
  skippedQuiet: number;
  skippedRecent: number;
  failed: number;
};

/**
 * Run the proactive sweep. `clientIds` selects which clients to consider
 * (the cron orders them by least-recent suggestion for fair rotation).
 */
export async function runCoachProactiveForClient(
  admin: Admin,
  clientId: string,
  today = new Date().toISOString().slice(0, 10),
): Promise<{ owners: number; suggested: number; quiet: number; recent: number; failed: number }> {
  const db = admin;
  const out = { owners: 0, suggested: 0, quiet: 0, recent: 0, failed: 0 };

  const { data: admins, error: adminsError } = await db
    .from("users").select("id, full_name, email")
    .eq("client_id", clientId).eq("role", "client_admin").limit(2);
  if (adminsError || !admins?.length) return out;

  const since = new Date(Date.parse(today + "T00:00:00Z") - PROACTIVE_INTERVAL_DAYS * 86_400_000).toISOString();

  for (const owner of admins as { id: string; full_name: string | null; email: string }[]) {
    out.owners++;
    try {
      // Dedupe: one proactive turn per owner per interval.
      const { data: recentTurn } = await db
        .from("coach_turns").select("id")
        .eq("client_id", clientId).eq("owner_id", owner.id).eq("origin", "proactive")
        .gte("created_at", since).limit(1).maybeSingle();
      if (recentTurn) { out.recent++; continue; }

      const { context, prompt } = await resolveNodeBrainContext({
        admin,
        clientId,
        request: {
          surface: "diagnostic",
          topic: "weekly proactive review",
          audience: "authenticated client",
          objective: "proactive attention scan",
          intent: "surface what needs the client admin's attention this week",
          actor: {
            userId: owner.id,
            accountRole: "client_admin",
            coachRole: "client",
            permissions: [...CLIENT_PERMISSIONS],
            conversationVisibility: "private_coach",
            intendedAudience: "private",
          },
          actionMode: "private",
          selectedVaultSourceIds: [],
          includeMarketIntelligence: false,
        },
        model: chatModel("COACH_PROACTIVE_MODEL"),
        promptVersion: "coach.proactive",
        maxKnowledge: 8,
        maxLibrary: 4,
        maxMemory: 12,
      });

      const tasks = (context.operations?.tasks ?? []) as ContextTask[];
      const team = (context.operations?.team ?? []) as ContextTeamMember[];
      const triggers = scanProactiveTriggers(tasks, today);
      if (!hasTriggers(triggers)) { out.quiet++; continue; }

      const composed = await composeProactiveAnswer({ prompt }, triggers, tasks, team);
      if ("error" in composed) { out.failed++; continue; }

      const draft = composed.draft
        ? validateDraftAgainstContext(composed.draft, team, tasks)
        : null;

      const snapshot = await persistNodeBrainContextSnapshot({
        admin,
        context,
        artifactKind: "coach_proactive",
        createdBy: owner.id,
      });

      // The same deterministic gate the interactive path enforces. (The
      // update_task intent type requires a status; the value is unused for
      // client_admin — the stored payload keeps its optional status.)
      const quality = evaluateCoachQuality({
        role: "client_admin",
        answer: composed.answer,
        snapshotId: snapshot.id,
        libraryAvailability: context.library?.availability ?? "not_requested",
        warningCodes: (context.warnings ?? []).map((w) => w.code),
        sources: [],
        action: draft
          ? draft.type === "update_task"
            ? { type: "update_task", status: draft.status ?? "todo" }
            : draft
          : null,
        expectedClientId: clientId,
      });
      if (!quality.passed) { out.failed++; continue; }

      // Find or create the owner's active thread (mirrors the interactive route).
      let threadId: string;
      const { data: existingThread } = await db
        .from("coach_threads").select("id")
        .eq("client_id", clientId).eq("owner_id", owner.id).eq("status", "active")
        .maybeSingle();
      if (existingThread) {
        threadId = existingThread.id;
      } else {
        const { data: created, error: threadError } = await db
          .from("coach_threads").insert({
            client_id: clientId, owner_id: owner.id, title: "Coach conversation",
          }).select("id").single();
        if (threadError) throw threadError;
        threadId = created.id;
      }

      let previewPayload: ProactiveDraft | null = null;
      if (draft) {
        const { error: previewError } = await db.from("coach_action_previews").insert({
          idempotency_key: crypto.randomUUID(),
          brain_context_snapshot_id: snapshot.id,
          client_id: clientId,
          owner_id: owner.id,
          action_type: draft.type,
          generated_payload: draft,
        });
        if (previewError) throw previewError;
        previewPayload = draft;
      }

      const { error: turnError } = await db.from("coach_turns").insert({
        thread_id: threadId,
        client_id: clientId,
        owner_id: owner.id,
        question: "Weekly proactive review",
        answer: composed.answer,
        coach_mode: previewPayload ? previewPayload.type : "private",
        brain_context_snapshot_id: snapshot.id,
        sources: [],
        suggestions: [],
        library_availability: context.library?.availability ?? "not_requested",
        warnings: context.warnings ?? [],
        action_draft: previewPayload,
        action_status: previewPayload ? "draft" : "none",
        origin: "proactive",
      });
      if (turnError) throw turnError;

      await notify([owner.id], {
        clientId,
        type: "coach_proactive",
        title: "Your Coach found something worth your attention",
        body: composed.answer.slice(0, 180),
        href: "/ask",
      });

      out.suggested++;
    } catch (e) {
      console.error("[coach/proactive] owner failed", owner.id, e);
      out.failed++;
    }
  }
  return out;
}

/** Clients ordered by least-recent proactive suggestion (never first). */
export async function selectProactiveClients(admin: Admin, limit: number): Promise<string[]> {
  const db = admin;
  const { data: clients, error } = await db
    .from("clients").select("id").is("archived_at", null).limit(500);
  if (error || !clients?.length) return [];

  const { data: recentTurns } = await db
    .from("coach_turns").select("client_id, created_at")
    .eq("origin", "proactive")
    .order("created_at", { ascending: false }).limit(1000);
  const lastByClient = new Map<string, string>();
  for (const row of (recentTurns ?? []) as { client_id: string; created_at: string }[]) {
    if (!lastByClient.has(row.client_id)) lastByClient.set(row.client_id, row.created_at);
  }

  return (clients as { id: string }[])
    .sort((a, b) => (lastByClient.get(a.id) ?? "").localeCompare(lastByClient.get(b.id) ?? ""))
    .slice(0, limit)
    .map((c) => c.id);
}
