/**
 * Expanded View — deep strategic analysis of a client.
 *
 * GET  — return the current analysis for a client (if any).
 * POST — generate (or regenerate) it: a single frontier-model pass over the
 *        whole crawled corpus (dossier + catalog + every page summary). This
 *        is INTERPRETATION, not fact — it is stored in vault_analyses, NOT in
 *        vault_items, so it never enters the grounded retrieval index.
 *
 * Admin-only to generate (one expensive call); everyone in the client can read.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { deepAnalysisLimiter, tooManyRequests } from "@/lib/rate-limit";

export const maxDuration = 60;

const ADMIN_ROLES = ["client_admin", "super_admin"];
const MODEL = process.env.VAULT_EXPAND_MODEL || "anthropic/claude-3.5-sonnet";

const schema = z.object({ clientId: z.string().uuid() });

const SYSTEM_PROMPT = `You are a senior brand and market strategist. You are given everything known about a company from a full crawl of its website (a factual dossier, a product catalog, and per-page summaries). Produce a DEEP strategic analysis for the team that supports this company day to day.

Write rich, specific markdown (1200-2500 words) with these sections:

## Industry & Market Context
What industry/sub-segment is this, what are the relevant market dynamics and trends, and where does this company sit within them.

## Positioning & Differentiation
How the company positions itself, its likely value proposition, what sets it apart (or where it blends in).

## Brand Identity & Voice
Tone, aesthetic, values signalled, the personality a VA should match when writing as this brand. Quote phrases from the site that reveal voice.

## Target Audience
Who they're for — demographics, psychographics, buying motivations, price sensitivity.

## Pricing & Market Tier
Budget / mid-market / premium / luxury, with evidence from the observed prices.

## Competitive Landscape
The kinds of competitors they face and how they likely compare. Be clear this is informed inference.

## Strengths, Gaps & Opportunities
Honest assessment: what's strong, what's missing or weak on the site, concrete opportunities.

## Recommendations
Actionable suggestions for the support team — content angles, customer-service framing, things to clarify.

RULES:
- Anchor brand/positioning/pricing claims to the actual site content; quote where useful.
- Industry and competitive observations are informed ANALYSIS — present them as reasoned inference, never as facts scraped from the site, and never invent specific competitor names, figures, or partnerships as if confirmed.
- Be specific and useful, not generic. No filler, no restating the brief.`;

export const GET = withAuth(async (req, { user }) => {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "Missing clientId." }, { status: 400 });
  const denied = assertClientAccess(user, clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data } = await admin.from("vault_analyses").select("*").eq("client_id", clientId).maybeSingle();
  return NextResponse.json({ analysis: data ?? null });
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured." }, { status: 503 });

  const rl = deepAnalysisLimiter.check(`expand:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const admin = createAdminClient();

  // Assemble the corpus: dossier + catalog (full) + every page summary.
  const { data: rows } = await admin
    .from("vault_items")
    .select("title, source_url, ai_summary, raw_content, tags, category")
    .eq("client_id", parsed.data.clientId)
    .order("created_at", { ascending: false });
  const items = (rows ?? []) as { title: string; source_url: string | null; ai_summary: string | null; raw_content: string | null; tags: string[]; category: string | null }[];

  if (items.length === 0) {
    return NextResponse.json({ error: "Nothing to analyze yet — crawl a site or add documents first." }, { status: 409 });
  }

  const dossier = items.find((i) => (i.tags ?? []).includes("dossier") || /^company dossier/i.test(i.title));
  const catalog = items.find((i) => /^product catalog/i.test(i.title));
  const summaries = items
    .filter((i) => i !== dossier && i !== catalog)
    .map((i) => `- [${i.category ?? "general"}] ${i.title}${i.source_url ? ` (${i.source_url})` : ""}: ${i.ai_summary ?? "(no summary)"}`)
    .join("\n");

  const sourceUrl = dossier?.source_url ?? items.find((i) => i.source_url)?.source_url ?? null;

  const corpus = [
    dossier?.raw_content ? `# COMPANY DOSSIER\n${dossier.raw_content}` : "",
    catalog?.raw_content ? `# PRODUCT CATALOG\n${catalog.raw_content.slice(0, 8000)}` : "",
    summaries ? `# PAGE SUMMARIES\n${summaries}` : "",
  ].filter(Boolean).join("\n\n").slice(0, 60000);

  let content = ""; let tokens = 0;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: corpus },
        ],
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: `Analysis failed: ${json?.error?.message ?? `model returned ${res.status}`}` }, { status: 502 });
    }
    content = json.choices?.[0]?.message?.content ?? "";
    tokens = json.usage?.total_tokens ?? 0;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Analysis call failed." }, { status: 502 });
  }

  if (!content.trim()) {
    return NextResponse.json({ error: "The model returned an empty analysis. Try again." }, { status: 502 });
  }

  // One analysis per client — upsert on the unique client_id.
  const { data: saved, error } = await admin
    .from("vault_analyses")
    .upsert({
      client_id: parsed.data.clientId,
      content,
      model: MODEL,
      source_url: sourceUrl,
      tokens_used: tokens,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ analysis: saved });
}, { roles: ADMIN_ROLES });
