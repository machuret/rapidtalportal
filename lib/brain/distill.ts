/**
 * Brain distillation v2 — a memory that thinks.
 *
 * Turns accumulated feedback (brain_signals) into durable lessons, but instead
 * of a flat append it now:
 *   • reinforces an existing lesson when the same idea recurs (confidence ↑),
 *   • routes near-duplicate-but-conflicting lessons to a "proposed" review queue,
 *   • makes every new lesson proposed until a human approves it,
 *   • scopes each lesson to its surface, channel, content type and task,
 *   • records the exact signals supporting or contradicting each lesson,
 *   • decays lessons that haven't been reinforced, muting the stale ones.
 *
 * Similarity uses the same OpenAI vectors stored in pgvector for runtime match.
 * Pure server util; callers must have authorised access to the client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logBrainEvent } from "./events";
import { embedTexts, cosine } from "./embed";
import { chatProvider, chatModel } from "./llm";
import {
  normalizeBrainMemoryScope,
  type BrainMemoryScope,
} from "../../supabase/functions/_shared/brain-memory-scope";

type Admin = SupabaseClient;

const configuredMinimum = Number(process.env.BRAIN_DISTILL_MIN ?? 3);
const MIN_NEW_SIGNALS = Number.isFinite(configuredMinimum)
  ? Math.max(1, Math.min(200, Math.floor(configuredMinimum)))
  : 3;
const SIGNAL_BATCH = 60;
const CLAIM_LEASE_SECONDS = 600;

const SIM_REINFORCE = 0.9;   // ≥ this & same kind → reinforce, don't duplicate
const SIM_CONFLICT = 0.86;   // ≥ this & opposing kind → flag as proposed (conflict)
interface SignalRow {
  id: string;
  surface: string;
  artifact_text: string;
  rating: number;
  reason: string | null;
  context: Record<string, unknown> | null;
  dimensions: string[];
  channel: string | null;
  content_type: string | null;
  distill_claim_token: string | null;
}
interface MemRow {
  id: string;
  kind: string;
  content: string;
  confidence: number;
  source_count: number;
  embedding: number[] | null;
  scope: BrainMemoryScope | null;
  status: "proposed" | "active" | "muted" | "review_required";
}

export interface DistillResult {
  skipped: boolean;
  reason?: string;
  processedSignals: number;
  newMemories: number;
  reinforced: number;
  proposed: number;
  conflicts?: number;
}

const VALID_KINDS = new Set(["preference", "anti_pattern", "rule"]);
const POLARITY = new Set(["preference", "anti_pattern"]);

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim().toLocaleLowerCase())
      .filter(Boolean),
  )).slice(0, 20);
}

function scopeFromSignals(rows: SignalRow[]): BrainMemoryScope {
  const raw = {
    surfaces: rows.map((signal) => signal.surface),
    channels: rows.flatMap((signal) => textList([
      signal.channel,
      signal.context?.channel,
      signal.context?.platform,
    ])),
    contentTypes: rows.flatMap((signal) => textList([
      signal.content_type,
      signal.context?.content_type,
      signal.context?.contentType,
    ])),
    audiences: rows.flatMap((signal) => textList([signal.context?.audience])),
    objectives: rows.flatMap((signal) => textList([signal.context?.objective])),
  };
  const normalized = normalizeBrainMemoryScope(raw);
  return normalized.surfaces?.length ? normalized : { surfaces: ["content"] };
}

function overlap(left: string[] | undefined, right: string[] | undefined): boolean {
  if (!left?.length || !right?.length) return true;
  return left.some((value) => right.includes(value));
}

function scopesOverlap(leftValue: unknown, rightValue: unknown): boolean {
  const left = normalizeBrainMemoryScope(leftValue);
  const right = normalizeBrainMemoryScope(rightValue);
  if (left.global || right.global) return true;
  return (
    overlap(left.surfaces, right.surfaces) &&
    overlap(left.channels, right.channels) &&
    overlap(left.contentTypes, right.contentTypes) &&
    overlap(left.audiences, right.audiences) &&
    overlap(left.objectives, right.objectives)
  );
}

function scopesEquivalent(leftValue: unknown, rightValue: unknown): boolean {
  const canonical = (value: unknown) => {
    const scope = normalizeBrainMemoryScope(value);
    return JSON.stringify({
      surfaces: [...(scope.surfaces ?? [])].sort(),
      channels: [...(scope.channels ?? [])].sort(),
      contentTypes: [...(scope.contentTypes ?? [])].sort(),
      audiences: [...(scope.audiences ?? [])].sort(),
      objectives: [...(scope.objectives ?? [])].sort(),
      global: scope.global === true,
    });
  };
  return canonical(leftValue) === canonical(rightValue);
}

export function sharedSignalDimensions(
  rows: Array<{ dimensions?: string[] | null }>,
): string[] {
  if (!rows.length) return [];
  return Array.from(new Set(rows[0].dimensions ?? [])).filter((dimension) =>
    rows.every((row) => row.dimensions?.includes(dimension))
  );
}

export async function distillClientMemory(admin: Admin, clientId: string): Promise<DistillResult> {
  const empty: DistillResult = { skipped: true, processedSignals: 0, newMemories: 0, reinforced: 0, proposed: 0, conflicts: 0 };
  const llm = chatProvider();
  if (!llm) return { ...empty, reason: "No LLM provider configured (set OPENROUTER_API_KEY or OPENAI_API_KEY)." };

  const { data: sigData, error: claimError } = await admin.rpc("claim_brain_signals", {
    p_client_id: clientId,
    p_limit: SIGNAL_BATCH,
    p_min_signals: MIN_NEW_SIGNALS,
    p_lease_seconds: CLAIM_LEASE_SECONDS,
  });
  if (claimError) {
    throw new Error(`Could not claim Brain feedback: ${claimError.message}`);
  }

  const signals = (sigData ?? []) as SignalRow[];
  if (signals.length < MIN_NEW_SIGNALS) {
    await decayClientMemory(admin, clientId); // still let stale lessons fade
    return { ...empty, reason: "Not enough unclaimed feedback yet, or another distillation is running." };
  }
  const claimToken = signals[0]?.distill_claim_token;
  if (!claimToken || signals.some((signal) => signal.distill_claim_token !== claimToken)) {
    throw new Error("Brain feedback claim returned an invalid lease.");
  }
  const signalIds = signals.map((signal) => signal.id);
  const releaseClaim = async () => {
    const { error } = await admin.rpc("release_brain_signal_claim", {
      p_client_id: clientId,
      p_claim_token: claimToken,
    });
    if (error) console.error("[brain/distill] release claim", error.message);
  };

  // Existing lessons we might reinforce or conflict with.
  const { data: memData, error: memoryReadError } = await admin
    .from("brain_memory")
    .select("id, kind, content, confidence, source_count, embedding, scope, status")
    .eq("client_id", clientId)
    .in("status", ["active", "proposed", "review_required"])
    .limit(200);
  if (memoryReadError) {
    await releaseClaim();
    throw new Error(`Could not load Brain memory: ${memoryReadError.message}`);
  }
  const existing = (memData ?? []) as MemRow[];

  const liked = signals.filter((s) => s.rating === 1);
  const disliked = signals.filter((s) => s.rating === -1);
  const fmt = (s: SignalRow) =>
    `- signal_id=${s.id} [${s.surface}] ${s.artifact_text.slice(0, 240)}` +
    `${s.reason ? ` (reason: ${s.reason})` : ""}` +
    `${s.dimensions?.length ? ` dimensions=${JSON.stringify(s.dimensions)}` : ""}` +
    `${s.context && Object.keys(s.context).length ? ` context=${JSON.stringify(s.context).slice(0, 500)}` : ""}`;

  const userPrompt =
    `You maintain the long-term memory of an AI that produces marketing content and answers for ONE company.\n` +
    `Distil the recent human judgements below into a SHORT list of durable, specific lessons.\n\n` +
    (existing.length ? `ALREADY KNOWN (don't restate):\n${existing.slice(0, 40).map((m) => `- (${m.kind}) ${m.content}`).join("\n")}\n\n` : "") +
    `LIKED 👍:\n${liked.length ? liked.map(fmt).join("\n") : "(none)"}\n\n` +
    `DISLIKED 👎:\n${disliked.length ? disliked.map(fmt).join("\n") : "(none)"}\n\n` +
    `Rules:\n- Only lessons clearly supported above. Specific to this company.\n` +
    `- kind: "preference" (favour), "anti_pattern" (avoid), "rule" (hard constraint).\n` +
    `- scope is an object with optional arrays: surfaces ["ask","content","compose","tool"], channels ["linkedin","facebook","instagram","email","blog","newsletter"], contentTypes, audiences, objectives, plus optional global boolean.\n` +
    `- Prefer the narrowest scope supported by the linked signals. Do not use global merely because no channel is obvious.\n` +
    `- signal_ids must list the exact signal_id values that independently support this lesson. Never cite an ID that is not shown above.\n` +
    `- dimensions must list only the feedback dimensions explicitly present on all supporting signals. Never turn topic, factual or audience feedback into a voice/style lesson.\n` +
    `- At most 6 lessons; empty list if nothing new.\n\n` +
    `Return JSON: { "memories": [ { "kind", "content", "confidence" (0-100), "scope": object, "dimensions": string[], "signal_ids": string[] } ] }`;

  let res: Response;
  try {
    res = await fetch(llm.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.key}` },
      body: JSON.stringify({
        model: chatModel("BRAIN_DISTILL_MODEL"), temperature: 0.3, max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You distil noisy feedback into a few durable, specific lessons. Never invent preferences unsupported by the data." },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (e) {
    console.error("[brain/distill] fetch", e);
    await releaseClaim();
    return { ...empty, reason: `Failed to reach ${llm.provider}.` };
  }
  if (!res.ok) {
    console.error("[brain/distill]", llm.provider, res.status);
    await releaseClaim();
    return { ...empty, reason: `${llm.provider} request failed.` };
  }

  let parsed: { memories?: unknown[] };
  try { parsed = JSON.parse((await res.json()).choices?.[0]?.message?.content ?? "{}"); }
  catch {
    await releaseClaim();
    return { ...empty, reason: "Failed to parse AI response." };
  }

  const claimedIds = new Set(signalIds);
  const candidates = (Array.isArray(parsed.memories) ? parsed.memories : [])
    .map((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      const kind = typeof o.kind === "string" && VALID_KINDS.has(o.kind) ? o.kind : "preference";
      const content = typeof o.content === "string" ? o.content.trim() : "";
      const confNum = Number(o.confidence);
      const confidence = Number.isFinite(confNum) ? Math.max(0, Math.min(100, Math.round(confNum))) : 50;
      const supportingIds = Array.from(new Set(
        Array.isArray(o.signal_ids)
          ? o.signal_ids.filter((id): id is string => typeof id === "string" && claimedIds.has(id))
          : [],
      ));
      const supportingSignals = signals.filter((signal) => supportingIds.includes(signal.id));
      const supportedDimensions = new Set(sharedSignalDimensions(supportingSignals));
      const hasStructuredDimensions = supportingSignals.some((signal) => signal.dimensions?.length);
      const dimensions = hasStructuredDimensions
        ? Array.from(new Set(
            Array.isArray(o.dimensions)
              ? o.dimensions.filter((dimension): dimension is string =>
                  typeof dimension === "string" && supportedDimensions.has(dimension)
                )
              : [],
          ))
        : ["legacy_feedback"];
      const requestedScope = normalizeBrainMemoryScope(o.scope);
      const scope = requestedScope.global || requestedScope.surfaces?.length
        ? requestedScope
        : scopeFromSignals(supportingSignals);
      return { kind, content, confidence, scope, dimensions, signalIds: supportingIds };
    })
    .filter((m) => m.content && m.signalIds.length > 0 && m.dimensions.length > 0);

  // Embed candidates + any existing lessons missing an embedding (backfill).
  const needEmbedExisting = existing
    .filter((m) => !Array.isArray(m.embedding) || m.embedding.length === 0)
    .slice(0, 40);
  const toEmbed = [...candidates.map((c) => c.content), ...needEmbedExisting.map((m) => m.content)];
  const vecs = await embedTexts(toEmbed);
  const candVecs = vecs ? vecs.slice(0, candidates.length) : null;
  const backfills: { id: string; embedding: number[] }[] = [];
  if (vecs) {
    // Backfills are committed with the memory writes and signal acknowledgement.
    const exVecs = vecs.slice(candidates.length);
    needEmbedExisting.forEach((m, i) => {
      m.embedding = exVecs[i];
      backfills.push({ id: m.id, embedding: exVecs[i] });
    });
  }

  const reinforces: { id: string; signalIds: string[] }[] = [];
  const inserts: {
    kind: string;
    content: string;
    confidence: number;
    scope: BrainMemoryScope;
    embedding: number[] | null;
    signalIds: string[];
    contradictsMemoryId?: string;
    conflictSummary?: string;
  }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const cVec = candVecs?.[i] ?? null;

    // Find duplicates only inside the exact same task scope. A semantically
    // closer Instagram lesson must never hide an existing LinkedIn duplicate.
    let bestEquivalent: { m: MemRow; sim: number } | null = null;
    let bestConflict: { m: MemRow; sim: number } | null = null;
    if (cVec) {
      for (const m of existing) {
        if (!Array.isArray(m.embedding) || m.embedding.length === 0) continue;
        const sim = cosine(cVec, m.embedding);
        if (
          m.kind === c.kind &&
          scopesEquivalent(m.scope, c.scope) &&
          (!bestEquivalent || sim > bestEquivalent.sim)
        ) {
          bestEquivalent = { m, sim };
        }
        if (
          m.kind !== c.kind &&
          POLARITY.has(m.kind) &&
          POLARITY.has(c.kind) &&
          scopesOverlap(m.scope, c.scope) &&
          (!bestConflict || sim > bestConflict.sim)
        ) {
          bestConflict = { m, sim };
        }
      }
    }

    // Reinforce a recurring lesson rather than duplicating it.
    if (
      bestEquivalent &&
      bestEquivalent.sim >= SIM_REINFORCE
    ) {
      reinforces.push({ id: bestEquivalent.m.id, signalIds: c.signalIds });
      continue;
    }

    const conflict = !!bestConflict && bestConflict.sim >= SIM_CONFLICT;
    inserts.push({
      kind: c.kind,
      content: c.content,
      confidence: c.confidence,
      scope: c.scope,
      embedding: cVec ?? null,
      signalIds: c.signalIds,
      ...(conflict && bestConflict ? {
        contradictsMemoryId: bestConflict.m.id,
        conflictSummary: `Existing: “${bestConflict.m.content.slice(0, 500)}” New feedback: “${c.content.slice(0, 500)}” Suggested resolution: narrow the lessons to distinct task scopes or choose which should apply.`,
      } : {}),
    });
  }

  // One database transaction applies every memory mutation and only then marks
  // the exact leased signals as distilled. Any error rolls back the whole batch.
  const { data: commitData, error: commitError } = await admin.rpc("commit_brain_distillation", {
    p_client_id: clientId,
    p_claim_token: claimToken,
    p_signal_ids: signalIds,
    p_operations: { backfills, reinforces, inserts },
  });
  if (commitError) {
    await releaseClaim();
    throw new Error(`Brain distillation commit failed: ${commitError.message}`);
  }
  const committed = commitData as {
    processedSignals: number;
    newMemories: number;
    reinforced: number;
    proposed: number;
    conflicts?: number;
  } | null;
  if (!committed || committed.processedSignals !== signals.length) {
    throw new Error("Brain distillation commit returned an invalid acknowledgement.");
  }

  // Decay is independent maintenance after the learning transaction. A decay
  // failure must not turn a successfully committed batch into a false retry.
  try {
    await decayClientMemory(admin, clientId);
  } catch (error) {
    console.error("[brain/distill] decay after commit", error);
  }

  if (committed.newMemories + committed.reinforced + committed.proposed + (committed.conflicts ?? 0) > 0) {
    const bits: string[] = [];
    if (committed.newMemories) bits.push(`learned ${committed.newMemories}`);
    if (committed.reinforced) bits.push(`reinforced ${committed.reinforced}`);
    if (committed.proposed) bits.push(`proposed ${committed.proposed} for review`);
    if (committed.conflicts) bits.push(`flagged ${committed.conflicts} conflict${committed.conflicts === 1 ? "" : "s"}`);
    const total = committed.newMemories + committed.reinforced + committed.proposed + (committed.conflicts ?? 0);
    await logBrainEvent(admin, clientId, "learned", `From your feedback: ${bits.join(", ")} lesson${total === 1 ? "" : "s"}`,
      { inserted: committed.newMemories, reinforced: committed.reinforced, proposed: committed.proposed, conflicts: committed.conflicts ?? 0 });
  }

  return { skipped: false, ...committed };
}

/** Fade lessons that haven't been reinforced lately; mute the ones that fall too
 * low. Exported so the cron can decay idle clients (no new feedback) too —
 * otherwise stale lessons would never fade for a client that stops rating. */
export async function decayClientMemory(admin: Admin, clientId: string): Promise<void> {
  const { error } = await admin.rpc("decay_brain_memories", { p_client_id: clientId });
  if (error && !/function .* does not exist/i.test(error.message)) {
    throw new Error(`Could not decay Brain memory: ${error.message}`);
  }
}
