import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderPrompt } from "@/lib/prompts/server";

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
    // New window
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW,
    };
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

type VaultRow = {
  id: string;
  title: string;
  raw_content: string | null;
  category: string | null;
  ai_summary: string | null;
};

type DnaRow = Record<string, unknown>;

function buildContext(dna: DnaRow | null, vaultItems: VaultRow[]): string {
  let ctx = "";

  if (dna) {
    ctx += "=== COMPANY DNA ===\n";
    const fields = [
      "company_name", "mission", "services", "values", "description",
      "target_demographic", "client_type",
    ];
    for (const f of fields) {
      const v = dna[f];
      if (v && typeof v === "string" && v.trim()) {
        ctx += `${f.toUpperCase()}: ${v.trim()}\n`;
      }
    }
    // Include extra JSONB fields as additional context
    const extra = dna["extra"];
    if (extra && typeof extra === "object" && !Array.isArray(extra)) {
      for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
        if (v && typeof v === "string" && v.trim()) {
          ctx += `${k.toUpperCase()}: ${v.trim()}\n`;
        }
      }
    }
    ctx += "\n";
  }

  if (vaultItems.length > 0) {
    ctx += "=== VAULT CONTENT ===\n";
    const CONTEXT_CHAR_LIMIT = 12000; // ~3k tokens (avg 4 chars/token) — enough for topic generation
    let chars = 0;
    // Prioritise items with AI summaries (more signal-dense) before raw-content-only items
    const sorted = [...vaultItems].sort((a, b) => {
      if (a.ai_summary && !b.ai_summary) return -1;
      if (!a.ai_summary && b.ai_summary) return 1;
      return 0;
    });
    for (const item of sorted) {
      // Use ai_summary as dense signal; fall back to larger raw_content window (3000 chars)
      const snippet = item.ai_summary ?? item.raw_content?.slice(0, 3000) ?? "";
      if (!snippet.trim()) continue;
      const entry = `[${item.category?.toUpperCase() ?? "DOC"}] ${item.title}\n${snippet}\n\n`;
      if (chars + entry.length > CONTEXT_CHAR_LIMIT) break;
      ctx += entry;
      chars += entry.length;
    }
  }

  return ctx;
}

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
        }
      }
    );
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: "OpenAI not configured." }, { status: 500 });
  }

  const admin = createAdminClient();
  const [{ data: vaultItems }, { data: dna }] = await Promise.all([
    admin
      .from("vault_items")
      .select("id, title, raw_content, category, ai_summary")
      .eq("client_id", parsed.data.client_id)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("company_dna")
      .select("company_name, mission, services, values, description, target_demographic, client_type, extra, founders, location, phone, email, website")
      .eq("client_id", parsed.data.client_id)
      .maybeSingle(),
  ]);

  if (!vaultItems?.length && !dna) {
    return NextResponse.json(
      { error: "No Vault content or Company DNA found. Add documents to the Vault first." },
      { status: 422 }
    );
  }

  const context = buildContext(dna as DnaRow | null, (vaultItems ?? []) as VaultRow[]);
  const count = parsed.data.count;

  const userPrompt = `Based on the company information below, generate exactly ${count} content topic ideas.\n\n${context}`;
  const systemPrompt = await renderPrompt("content.topics");

  let openaiRes: Response;
  try {
    openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
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

  const topics = Array.isArray(parsed2.topics) ? parsed2.topics : [];

  return NextResponse.json({ topics });
});
