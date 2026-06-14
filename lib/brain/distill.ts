/**
 * Brain distillation — turn accumulated feedback into durable, curated memory.
 *
 * This is the engine behind "the Brain learns from its mistakes". It reads the
 * undistilled brain_signals for a client (👍/👎 with reasons), asks an LLM to
 * distil them into a short list of lessons (preferences to favour, anti-patterns
 * to avoid, hard rules), stores those in brain_memory, and marks the signals as
 * distilled so they're never reprocessed. The memory then conditions every
 * future generation via lib/brain/context.ts.
 *
 * Pure server util. Callers must have already authorised access to the client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logBrainEvent } from "./events";

type Admin = SupabaseClient;

const DISTILL_MODEL = process.env.BRAIN_DISTILL_MODEL ?? "gpt-4o-mini";
const MIN_NEW_SIGNALS = Number(process.env.BRAIN_DISTILL_MIN ?? 3);
const SIGNAL_BATCH = 60; // signals folded per run

interface SignalRow { id: string; surface: string; artifact_text: string; rating: number; reason: string | null }
interface MemoryRow { kind: string; content: string }

export interface DistillResult {
  skipped: boolean;
  reason?: string;
  processedSignals: number;
  newMemories: number;
}

const VALID_KINDS = new Set(["preference", "anti_pattern", "rule"]);

/**
 * Distil one client's pending signals into brain_memory.
 * Returns counts; never throws on "nothing to do".
 */
export async function distillClientMemory(admin: Admin, clientId: string): Promise<DistillResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return { skipped: true, reason: "OpenAI not configured.", processedSignals: 0, newMemories: 0 };

  const { data: sigData } = await admin
    .from("brain_signals")
    .select("id, surface, artifact_text, rating, reason")
    .eq("client_id", clientId)
    .is("distilled_at", null)
    .order("created_at", { ascending: true })
    .limit(SIGNAL_BATCH);

  const signals = (sigData ?? []) as SignalRow[];
  if (signals.length < MIN_NEW_SIGNALS) {
    return { skipped: true, reason: "Not enough new feedback yet.", processedSignals: 0, newMemories: 0 };
  }

  // Existing active memory — so the model refines/extends rather than duplicating.
  const { data: memData } = await admin
    .from("brain_memory")
    .select("kind, content")
    .eq("client_id", clientId)
    .eq("active", true)
    .limit(100);
  const existing = (memData ?? []) as MemoryRow[];
  const existingLower = new Set(existing.map((m) => m.content.trim().toLowerCase()));

  const liked = signals.filter((s) => s.rating === 1);
  const disliked = signals.filter((s) => s.rating === -1);

  const fmt = (s: SignalRow) => `- ${s.artifact_text.slice(0, 200)}${s.reason ? ` [reason: ${s.reason}]` : ""}`;
  const userPrompt =
    `You maintain the long-term memory of an AI that generates marketing content for ONE company.\n` +
    `Below are recent human judgements of its output. Distil them into a SHORT list of durable, specific lessons that will improve future output for THIS company.\n\n` +
    (existing.length ? `ALREADY KNOWN (do not repeat these):\n${existing.map((m) => `- (${m.kind}) ${m.content}`).join("\n")}\n\n` : "") +
    `APPROVED / 👍 (what they liked):\n${liked.length ? liked.map(fmt).join("\n") : "(none)"}\n\n` +
    `REJECTED / 👎 / "doesn't make sense" (what they disliked):\n${disliked.length ? disliked.map(fmt).join("\n") : "(none)"}\n\n` +
    `Rules:\n` +
    `- Only output lessons clearly supported by the judgements above.\n` +
    `- Be specific to this company (topics, angles, tone, formats), not generic advice.\n` +
    `- "preference" = something to favour. "anti_pattern" = something to avoid. "rule" = a hard constraint.\n` +
    `- Return at most 6 lessons. If nothing new is learned, return an empty list.\n\n` +
    `Return JSON exactly: { "memories": [ { "kind": "preference"|"anti_pattern"|"rule", "content": string, "confidence": number 0-100 } ] }`;

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: DISTILL_MODEL,
        temperature: 0.3,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You distil noisy human feedback into a small set of durable, specific lessons. You never invent preferences not supported by the data." },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (e) {
    console.error("[brain/distill] fetch error", e);
    return { skipped: true, reason: "Failed to reach OpenAI.", processedSignals: 0, newMemories: 0 };
  }

  if (!res.ok) {
    console.error("[brain/distill] OpenAI error", res.status, await res.text());
    return { skipped: true, reason: "OpenAI request failed.", processedSignals: 0, newMemories: 0 };
  }

  let parsed: { memories?: unknown[] };
  try { parsed = JSON.parse((await res.json()).choices?.[0]?.message?.content ?? "{}"); }
  catch { return { skipped: true, reason: "Failed to parse AI response.", processedSignals: 0, newMemories: 0 }; }

  const rows = (Array.isArray(parsed.memories) ? parsed.memories : [])
    .map((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      const kind = typeof o.kind === "string" && VALID_KINDS.has(o.kind) ? o.kind : "preference";
      const content = typeof o.content === "string" ? o.content.trim() : "";
      const confNum = Number(o.confidence);
      const confidence = Number.isFinite(confNum) ? Math.max(0, Math.min(100, Math.round(confNum))) : 50;
      return { kind, content, confidence };
    })
    .filter((m) => m.content && !existingLower.has(m.content.toLowerCase()));

  // De-dupe within this batch too.
  const seen = new Set<string>();
  const fresh = rows.filter((m) => { const k = m.content.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });

  if (fresh.length > 0) {
    const { error: insErr } = await admin.from("brain_memory").insert(
      fresh.map((m) => ({
        client_id: clientId,
        kind: m.kind,
        content: m.content,
        confidence: m.confidence,
        source_count: signals.length,
      }))
    );
    if (insErr) console.error("[brain/distill] memory insert", insErr.message);
    else await logBrainEvent(admin, clientId, "learned",
      `Learned ${fresh.length} new lesson${fresh.length === 1 ? "" : "s"} from your feedback`,
      { count: fresh.length });
  }

  // Mark these signals distilled regardless, so we don't reprocess them.
  const ids = signals.map((s) => s.id);
  const { error: markErr } = await admin
    .from("brain_signals")
    .update({ distilled_at: new Date().toISOString() })
    .in("id", ids);
  if (markErr) console.error("[brain/distill] mark distilled", markErr.message);

  return { skipped: false, processedSignals: signals.length, newMemories: fresh.length };
}
