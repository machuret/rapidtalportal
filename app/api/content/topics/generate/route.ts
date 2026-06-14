import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderPrompt } from "@/lib/prompts/server";
import { buildBrainContext } from "@/lib/brain/context";
import { embeddingFit } from "@/lib/brain/embed";
import { logBrainEvent } from "@/lib/brain/events";

const bodySchema = z.object({
  client_id: z.string().uuid(),
  count:     z.number().int().min(3).max(20).default(8),
});

// Rate limiting - per client, per window
// 10 requests per 5 minutes per client
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS_PER_WINDOW = 10;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory rate limit store (resets on deployment - OK for MVP)
const rateLimitStore = new Map<string, RateLimitEntry>();

function checkRateLimit(clientId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = clientId;

  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    const newEntry: RateLimitEntry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitStore.set(key, newEntry);
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetAt: newEntry.resetAt };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - entry.count, resetAt: entry.resetAt };
}

// System prompt lives in the prompt registry ("content.topics") — admin-editable.

// Below this fit score, the Brain pre-flags a topic as weak/off-brand so a human
// doesn't waste time on it. Env-tunable.
const FIT_THRESHOLD = Number(process.env.BRAIN_FIT_THRESHOLD ?? 55);
const TOPICS_MODEL = process.env.CONTENT_TOPICS_MODEL ?? "gpt-4o-mini";

const VALID_TYPES = new Set(["email", "social", "newsletter", "blog"]);

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  // Rate limiting check
  const rateLimit = checkRateLimit(parsed.data.client_id);
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later.", retryAfter },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(MAX_REQUESTS_PER_WINDOW),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
          "Retry-After": String(retryAfter),
        },
      }
    );
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: "OpenAI not configured." }, { status: 500 });
  }

  const admin = createAdminClient();
  // The Brain assembles the profile + Vault highlights + learned positives/negatives.
  // Topic generation spans every content channel, so inject content + all
  // channel-scoped lessons (plus global). Ask/Compose-only lessons are excluded.
  const brain = await buildBrainContext(admin, parsed.data.client_id, {
    surfaces: ["content", "email", "social", "blog", "newsletter"],
  });

  if (!brain.hasProfile && !brain.hasVault) {
    return NextResponse.json(
      { error: "No Company Brain profile or Vault content found. Fill in the Company Brain or add documents to the Vault first." },
      { status: 422 }
    );
  }

  const count = parsed.data.count;
  const systemPrompt = await renderPrompt("content.topics");
  const userPrompt =
    `${brain.text}\n` +
    `Based on the company information above, generate exactly ${count} content topic ideas.\n\n` +
    `RULES (follow strictly):\n` +
    `- Honour the company's goals, audience, brand voice and internal rules.\n` +
    `- Do NOT repeat, paraphrase, or resemble anything listed under "WHAT TO AVOID".\n` +
    `- Favour the angles/style listed under "WHAT WORKS HERE".\n` +
    `- For EACH topic, include "fit": an integer 0-100 for how well it fits THIS specific company (not generic), where below ${FIT_THRESHOLD} means weak, generic, or off-brand.\n\n` +
    `Return JSON exactly as: { "topics": [ { "title": string, "description": string, "content_type": "email"|"social"|"newsletter"|"blog", "rationale": string, "fit": number } ] }`;

  let openaiRes: Response;
  try {
    openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: TOPICS_MODEL,
        temperature: 0.8,
        max_tokens: 3000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt },
        ],
      }),
    });
  } catch (err) {
    console.error("[topics/generate] OpenAI fetch error:", err);
    return NextResponse.json({ error: "Failed to reach OpenAI." }, { status: 502 });
  }

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    console.error("[topics/generate] OpenAI error:", openaiRes.status, errText);
    return NextResponse.json({ error: "OpenAI request failed." }, { status: 502 });
  }

  const completion = await openaiRes.json();
  const raw = completion.choices?.[0]?.message?.content ?? "{}";

  let parsed2: { topics?: unknown[] };
  try {
    parsed2 = JSON.parse(raw);
  } catch {
    console.error("[topics/generate] JSON parse error. Raw:", raw.slice(0, 200));
    return NextResponse.json({ error: "Failed to parse AI response." }, { status: 500 });
  }

  const rawTopics = Array.isArray(parsed2.topics) ? parsed2.topics : [];

  // Normalise + capture the model's self-assessed fit.
  const base = rawTopics
    .map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!title) return null;
      const type = typeof o.content_type === "string" && VALID_TYPES.has(o.content_type) ? o.content_type : "blog";
      const fitNum = Number(o.fit);
      const llmFit = Number.isFinite(fitNum) ? Math.max(0, Math.min(100, Math.round(fitNum))) : null;
      return {
        title,
        description: typeof o.description === "string" ? o.description : "",
        content_type: type,
        rationale: typeof o.rationale === "string" ? o.rationale : "",
        llmFit,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  // Ground the score in the client's real acceptance history (embedding fit),
  // then blend with the model's self-assessment. Falls back to self-fit alone
  // when there isn't enough approved/rejected history yet.
  let embFits: (number | null)[] | null = null;
  try {
    embFits = await embeddingFit({
      positives: brain.positiveExamples,
      negatives: brain.negativeExamples,
      candidates: base.map((t) => `${t.title} — ${t.description}`),
    });
  } catch (e) {
    console.error("[topics/generate] embeddingFit failed", e);
  }

  // Shared provenance — what the Brain drew on to produce these ("Why this?").
  const whyBase = {
    profile: brain.hasProfile,
    vault: brain.hasVault,
    lessons: brain.memories,
    examples: brain.positives,
    grounded: embFits !== null,
  };

  const topics = base.map((t, i) => {
    const emb = embFits?.[i] ?? null;
    const fit =
      t.llmFit !== null && emb !== null ? Math.round(t.llmFit * 0.5 + emb * 0.5)
      : emb !== null ? emb
      : t.llmFit;
    return {
      title: t.title,
      description: t.description,
      content_type: t.content_type,
      rationale: t.rationale,
      fit,
      ai_flagged: fit !== null && fit < FIT_THRESHOLD,
      why: { ...whyBase, fit },
    };
  });

  // Journal: surface the value the Brain just delivered (weak ideas filtered).
  const flaggedCount = topics.filter((t) => t.ai_flagged).length;
  if (flaggedCount > 0) {
    await logBrainEvent(admin, parsed.data.client_id, "filtered",
      `Pre-screened ${topics.length} ideas and flagged ${flaggedCount} as weak before you saw them`,
      { total: topics.length, flagged: flaggedCount });
  }

  return NextResponse.json({
    topics,
    learnedFrom: { positives: brain.positives, negatives: brain.negatives, grounded: embFits !== null },
  });
});
