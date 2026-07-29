/**
 * Brain distillation v2 — a memory that thinks.
 *
 * Turns accumulated feedback (brain_signals) into durable lessons, but instead
 * of a flat append it now:
 *   • reinforces an existing lesson when the same idea recurs (confidence ↑),
 *   • routes near-duplicate-but-conflicting lessons to a "proposed" review queue,
 *   • gates hard rules / low-confidence lessons to "proposed" (human approval),
 *   • scopes each lesson to the surfaces it applies to,
 *   • decays lessons that haven't been reinforced, muting the stale ones.
 *
 * Similarity uses lesson embeddings (stored as JSON) compared in-process.
 * Pure server util; callers must have authorised access to the client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logBrainEvent } from "./events";
import { embedTexts, cosine } from "./embed";
import { chatProvider, chatModel } from "./llm";
import { normalizeBrainScopes } from "../../supabase/functions/_shared/brain-surfaces";

type Admin = SupabaseClient;

const configuredMinimum = Number(process.env.BRAIN_DISTILL_MIN ?? 3);
const MIN_NEW_SIGNALS = Number.isFinite(configuredMinimum)
  ? Math.max(1, Math.min(200, Math.floor(configuredMinimum)))
  : 3;
const SIGNAL_BATCH = 60;
const CLAIM_LEASE_SECONDS = 600;

const SIM_REINFORCE = 0.9;   // ≥ this & same kind → reinforce, don't duplicate
const SIM_CONFLICT = 0.86;   // ≥ this & opposing kind → flag as proposed (conflict)
const ACTIVE_CONF_MIN = 60;  // below this (or a hard rule) → proposed for review
const DECAY_DAYS = 21;
const DECAY_AMT = 3;
const MUTE_FLOOR = 25;

interface SignalRow {
  id: string;
  surface: string;
  artifact_text: string;
  rating: number;
  reason: string | null;
  distill_claim_token: string | null;
}
interface MemRow { id: string; kind: string; content: string; confidence: number; source_count: number; embedding: number[] | null }

export interface DistillResult {
  skipped: boolean;
  reason?: string;
  processedSignals: number;
  newMemories: number;
  reinforced: number;
  proposed: number;
}

const VALID_KINDS = new Set(["preference", "anti_pattern", "rule"]);
const POLARITY = new Set(["preference", "anti_pattern"]);

export async function distillClientMemory(admin: Admin, clientId: string): Promise<DistillResult> {
  const empty: DistillResult = { skipped: true, processedSignals: 0, newMemories: 0, reinforced: 0, proposed: 0 };
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
    .select("id, kind, content, confidence, source_count, embedding")
    .eq("client_id", clientId)
    .in("status", ["active", "proposed"])
    .limit(200);
  if (memoryReadError) {
    await releaseClaim();
    throw new Error(`Could not load Brain memory: ${memoryReadError.message}`);
  }
  const existing = (memData ?? []) as MemRow[];

  const liked = signals.filter((s) => s.rating === 1);
  const disliked = signals.filter((s) => s.rating === -1);
  const fmt = (s: SignalRow) => `- [${s.surface}] ${s.artifact_text.slice(0, 180)}${s.reason ? ` (reason: ${s.reason})` : ""}`;

  const userPrompt =
    `You maintain the long-term memory of an AI that produces marketing content and answers for ONE company.\n` +
    `Distil the recent human judgements below into a SHORT list of durable, specific lessons.\n\n` +
    (existing.length ? `ALREADY KNOWN (don't restate):\n${existing.slice(0, 40).map((m) => `- (${m.kind}) ${m.content}`).join("\n")}\n\n` : "") +
    `LIKED 👍:\n${liked.length ? liked.map(fmt).join("\n") : "(none)"}\n\n` +
    `DISLIKED 👎:\n${disliked.length ? disliked.map(fmt).join("\n") : "(none)"}\n\n` +
    `Rules:\n- Only lessons clearly supported above. Specific to this company.\n` +
    `- kind: "preference" (favour), "anti_pattern" (avoid), "rule" (hard constraint).\n` +
    `- scope: array of where it applies, from ["content","vault_answer","compose","tool","kb","email","social","blog","newsletter","all"]. Use "vault_answer" for Ask the Vault and ["all"] if general.\n` +
    `- At most 6 lessons; empty list if nothing new.\n\n` +
    `Return JSON: { "memories": [ { "kind", "content", "confidence" (0-100), "scope": string[] } ] }`;

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

  // If the model omits or misspells scope, contain the lesson to the surfaces
  // that produced this batch. Only an explicit "all" may become global.
  const batchScopes = normalizeBrainScopes(signals.map((signal) => signal.surface));
  const fallbackScopes = batchScopes.length ? batchScopes : normalizeBrainScopes(["all"]);
  const candidates = (Array.isArray(parsed.memories) ? parsed.memories : [])
    .map((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      const kind = typeof o.kind === "string" && VALID_KINDS.has(o.kind) ? o.kind : "preference";
      const content = typeof o.content === "string" ? o.content.trim() : "";
      const confNum = Number(o.confidence);
      const confidence = Number.isFinite(confNum) ? Math.max(0, Math.min(100, Math.round(confNum))) : 50;
      const requestedScopes = normalizeBrainScopes(Array.isArray(o.scope) ? o.scope : []);
      const scopeArr = requestedScopes.length ? requestedScopes : fallbackScopes;
      return { kind, content, confidence, scope: scopeArr };
    })
    .filter((m) => m.content);

  // Embed candidates + any existing lessons missing an embedding (backfill).
  const needEmbedExisting = existing.filter((m) => !Array.isArray(m.embedding) || m.embedding.length === 0);
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

  const reinforces: { id: string }[] = [];
  const inserts: {
    kind: string;
    content: string;
    confidence: number;
    status: "active" | "proposed";
    scope: { surfaces?: string[] };
    embedding: number[] | null;
  }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const cVec = candVecs?.[i] ?? null;

    // Find the most similar existing lesson (if we have vectors).
    let best: { m: MemRow; sim: number } | null = null;
    if (cVec) {
      for (const m of existing) {
        if (!Array.isArray(m.embedding) || m.embedding.length === 0) continue;
        const sim = cosine(cVec, m.embedding);
        if (!best || sim > best.sim) best = { m, sim };
      }
    }

    // Reinforce a recurring lesson rather than duplicating it.
    if (best && best.sim >= SIM_REINFORCE && best.m.kind === c.kind) {
      reinforces.push({ id: best.m.id });
      continue;
    }

    // Conflict (same topic, opposite polarity) or low confidence / hard rule → propose.
    const conflict = !!best && best.sim >= SIM_CONFLICT && best.m.kind !== c.kind && POLARITY.has(best.m.kind) && POLARITY.has(c.kind);
    const status = conflict || c.kind === "rule" || c.confidence < ACTIVE_CONF_MIN ? "proposed" : "active";
    inserts.push({
      kind: c.kind,
      content: c.content,
      confidence: c.confidence,
      status,
      scope: { surfaces: c.scope },
      embedding: cVec ?? null,
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

  if (committed.newMemories + committed.reinforced + committed.proposed > 0) {
    const bits: string[] = [];
    if (committed.newMemories) bits.push(`learned ${committed.newMemories}`);
    if (committed.reinforced) bits.push(`reinforced ${committed.reinforced}`);
    if (committed.proposed) bits.push(`proposed ${committed.proposed} for review`);
    const total = committed.newMemories + committed.reinforced + committed.proposed;
    await logBrainEvent(admin, clientId, "learned", `From your feedback: ${bits.join(", ")} lesson${total === 1 ? "" : "s"}`,
      { inserted: committed.newMemories, reinforced: committed.reinforced, proposed: committed.proposed });
  }

  return { skipped: false, ...committed };
}

/** Fade lessons that haven't been reinforced lately; mute the ones that fall too
 * low. Exported so the cron can decay idle clients (no new feedback) too —
 * otherwise stale lessons would never fade for a client that stops rating. */
export async function decayClientMemory(admin: Admin, clientId: string): Promise<void> {
  const cutoff = new Date(Date.now() - DECAY_DAYS * 86_400_000).toISOString();
  const { data, error: readError } = await admin
    .from("brain_memory")
    .select("id, confidence")
    .eq("client_id", clientId)
    .eq("status", "active")
    .lt("last_reinforced_at", cutoff)
    .limit(200);
  if (readError) throw new Error(`Could not load stale Brain memory: ${readError.message}`);
  const stale = (data ?? []) as { id: string; confidence: number }[];
  const updates = await Promise.all(stale.map((m) => {
    const next = m.confidence - DECAY_AMT;
    if (next < MUTE_FLOOR) {
      return admin.from("brain_memory").update({ status: "muted", active: false, confidence: Math.max(0, next), updated_at: new Date().toISOString() }).eq("id", m.id);
    }
    return admin.from("brain_memory").update({ confidence: next, updated_at: new Date().toISOString() }).eq("id", m.id);
  }));
  const failed = updates.find((result) => result.error);
  if (failed?.error) throw new Error(`Could not decay Brain memory: ${failed.error.message}`);
}
