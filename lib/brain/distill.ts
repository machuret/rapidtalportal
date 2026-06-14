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

type Admin = SupabaseClient;

const DISTILL_MODEL = process.env.BRAIN_DISTILL_MODEL ?? "gpt-4o-mini";
const MIN_NEW_SIGNALS = Number(process.env.BRAIN_DISTILL_MIN ?? 3);
const SIGNAL_BATCH = 60;

const SIM_REINFORCE = 0.9;   // ≥ this & same kind → reinforce, don't duplicate
const SIM_CONFLICT = 0.86;   // ≥ this & opposing kind → flag as proposed (conflict)
const ACTIVE_CONF_MIN = 60;  // below this (or a hard rule) → proposed for review
const DECAY_DAYS = 21;
const DECAY_AMT = 3;
const MUTE_FLOOR = 25;

interface SignalRow { id: string; surface: string; artifact_text: string; rating: number; reason: string | null }
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
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return { ...empty, reason: "OpenAI not configured." };

  const { data: sigData } = await admin
    .from("brain_signals")
    .select("id, surface, artifact_text, rating, reason")
    .eq("client_id", clientId)
    .is("distilled_at", null)
    .order("created_at", { ascending: true })
    .limit(SIGNAL_BATCH);

  const signals = (sigData ?? []) as SignalRow[];
  if (signals.length < MIN_NEW_SIGNALS) {
    await decay(admin, clientId); // still let stale lessons fade
    return { ...empty, reason: "Not enough new feedback yet." };
  }

  // Existing lessons we might reinforce or conflict with.
  const { data: memData } = await admin
    .from("brain_memory")
    .select("id, kind, content, confidence, source_count, embedding")
    .eq("client_id", clientId)
    .in("status", ["active", "proposed"])
    .limit(200);
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
    `- scope: array of where it applies, from ["content","ask","compose","email","social","blog","newsletter","all"]. Use ["all"] if general.\n` +
    `- At most 6 lessons; empty list if nothing new.\n\n` +
    `Return JSON: { "memories": [ { "kind", "content", "confidence" (0-100), "scope": string[] } ] }`;

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: DISTILL_MODEL, temperature: 0.3, max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You distil noisy feedback into a few durable, specific lessons. Never invent preferences unsupported by the data." },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (e) {
    console.error("[brain/distill] fetch", e);
    return { ...empty, reason: "Failed to reach OpenAI." };
  }
  if (!res.ok) {
    console.error("[brain/distill] OpenAI", res.status);
    return { ...empty, reason: "OpenAI request failed." };
  }

  let parsed: { memories?: unknown[] };
  try { parsed = JSON.parse((await res.json()).choices?.[0]?.message?.content ?? "{}"); }
  catch { return { ...empty, reason: "Failed to parse AI response." }; }

  const candidates = (Array.isArray(parsed.memories) ? parsed.memories : [])
    .map((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      const kind = typeof o.kind === "string" && VALID_KINDS.has(o.kind) ? o.kind : "preference";
      const content = typeof o.content === "string" ? o.content.trim() : "";
      const confNum = Number(o.confidence);
      const confidence = Number.isFinite(confNum) ? Math.max(0, Math.min(100, Math.round(confNum))) : 50;
      const scopeArr = Array.isArray(o.scope) ? (o.scope as unknown[]).filter((x) => typeof x === "string").map((x) => (x as string).toLowerCase()) : [];
      return { kind, content, confidence, scope: scopeArr };
    })
    .filter((m) => m.content);

  // Mark signals processed regardless of outcome so we never reprocess them.
  const markDistilled = async () => {
    const { error } = await admin.from("brain_signals").update({ distilled_at: new Date().toISOString() }).in("id", signals.map((s) => s.id));
    if (error) console.error("[brain/distill] mark", error.message);
  };

  if (candidates.length === 0) {
    await markDistilled();
    await decay(admin, clientId);
    return { skipped: false, processedSignals: signals.length, newMemories: 0, reinforced: 0, proposed: 0 };
  }

  // Embed candidates + any existing lessons missing an embedding (backfill).
  const needEmbedExisting = existing.filter((m) => !Array.isArray(m.embedding) || m.embedding.length === 0);
  const toEmbed = [...candidates.map((c) => c.content), ...needEmbedExisting.map((m) => m.content)];
  const vecs = await embedTexts(toEmbed);
  const candVecs = vecs ? vecs.slice(0, candidates.length) : null;
  if (vecs) {
    // Backfill existing embeddings we just computed.
    const exVecs = vecs.slice(candidates.length);
    await Promise.all(needEmbedExisting.map((m, i) => {
      m.embedding = exVecs[i];
      return admin.from("brain_memory").update({ embedding: exVecs[i] }).eq("id", m.id);
    }));
  }

  let inserted = 0, reinforced = 0, proposed = 0;
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
      await admin.from("brain_memory").update({
        confidence: Math.min(100, best.m.confidence + 8),
        source_count: best.m.source_count + 1,
        last_reinforced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", best.m.id);
      reinforced++;
      continue;
    }

    // Conflict (same topic, opposite polarity) or low confidence / hard rule → propose.
    const conflict = !!best && best.sim >= SIM_CONFLICT && best.m.kind !== c.kind && POLARITY.has(best.m.kind) && POLARITY.has(c.kind);
    const status = conflict || c.kind === "rule" || c.confidence < ACTIVE_CONF_MIN ? "proposed" : "active";
    if (status === "proposed") proposed++; else inserted++;

    await admin.from("brain_memory").insert({
      client_id: clientId,
      kind: c.kind,
      content: c.content,
      confidence: c.confidence,
      source_count: signals.length,
      status,
      active: status === "active",
      scope: c.scope.length ? { surfaces: c.scope } : {},
      embedding: cVec ?? null,
      last_reinforced_at: new Date().toISOString(),
    });
  }

  await markDistilled();
  await decay(admin, clientId);

  if (inserted + reinforced + proposed > 0) {
    const bits: string[] = [];
    if (inserted) bits.push(`learned ${inserted}`);
    if (reinforced) bits.push(`reinforced ${reinforced}`);
    if (proposed) bits.push(`proposed ${proposed} for review`);
    await logBrainEvent(admin, clientId, "learned", `From your feedback: ${bits.join(", ")} lesson${inserted + reinforced + proposed === 1 ? "" : "s"}`,
      { inserted, reinforced, proposed });
  }

  return { skipped: false, processedSignals: signals.length, newMemories: inserted, reinforced, proposed };
}

/** Fade lessons that haven't been reinforced lately; mute the ones that fall too low. */
async function decay(admin: Admin, clientId: string): Promise<void> {
  const cutoff = new Date(Date.now() - DECAY_DAYS * 86_400_000).toISOString();
  const { data } = await admin
    .from("brain_memory")
    .select("id, confidence")
    .eq("client_id", clientId)
    .eq("status", "active")
    .lt("last_reinforced_at", cutoff)
    .limit(200);
  const stale = (data ?? []) as { id: string; confidence: number }[];
  await Promise.all(stale.map((m) => {
    const next = m.confidence - DECAY_AMT;
    if (next < MUTE_FLOOR) {
      return admin.from("brain_memory").update({ status: "muted", active: false, confidence: Math.max(0, next), updated_at: new Date().toISOString() }).eq("id", m.id);
    }
    return admin.from("brain_memory").update({ confidence: next, updated_at: new Date().toISOString() }).eq("id", m.id);
  }));
}
