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
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const ADMIN_ROLES = ["client_admin", "super_admin"];
const MODEL = process.env.VAULT_EXPAND_MODEL || "anthropic/claude-3.5-sonnet";

const schema = z.object({ clientId: z.string().uuid() });

// System prompt lives in the prompt registry ("vault.expand") — admin-editable.

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

  // Assemble the corpus from everything we know about the company:
  //   declared Company DNA (authoritative) + crawl dossier + product catalog +
  //   real excerpts from the richest pages + a summary of every page.
  const [{ data: rows }, { data: dnaRow }] = await Promise.all([
    admin
      .from("vault_items")
      .select("title, source_url, ai_summary, raw_content, tags, category")
      .eq("client_id", parsed.data.clientId)
      .order("created_at", { ascending: false }),
    admin
      .from("company_dna")
      .select("company_name, founders, location, phone, email, website, client_type, target_demographic, values, services, brand_voice, sign_off, extra")
      .eq("client_id", parsed.data.clientId)
      .maybeSingle(),
  ]);
  const items = (rows ?? []) as { title: string; source_url: string | null; ai_summary: string | null; raw_content: string | null; tags: string[]; category: string | null }[];

  // Declared profile — human-curated, so it grounds positioning/voice/audience
  // in stated fact rather than crawl inference alone.
  const dna = (dnaRow ?? null) as Record<string, unknown> | null;
  let dnaText = "";
  if (dna) {
    const lines: string[] = [];
    const add = (label: string, v: unknown) => { if (v && String(v).trim()) lines.push(`${label}: ${String(v).trim()}`); };
    add("Company name", dna.company_name); add("Founders", dna.founders); add("Location", dna.location);
    add("Website", dna.website); add("Client type", dna.client_type);
    add("Target audience", dna.target_demographic); add("Values", dna.values);
    add("Services", dna.services); add("Brand voice", dna.brand_voice); add("Sign-off", dna.sign_off);
    if (dna.extra && typeof dna.extra === "object" && !Array.isArray(dna.extra)) {
      for (const [k, v] of Object.entries(dna.extra as Record<string, unknown>)) add(k, v);
    }
    dnaText = lines.join("\n");
  }

  if (items.length === 0 && !dnaText) {
    return NextResponse.json({ error: "Nothing to analyze yet — crawl a site, add documents, or fill in Company DNA first." }, { status: 409 });
  }

  const dossier = items.find((i) => (i.tags ?? []).includes("dossier") || /^company dossier/i.test(i.title));
  const catalog = items.find((i) => /^product catalog/i.test(i.title));
  const otherPages = items.filter((i) => i !== dossier && i !== catalog);

  const summaries = otherPages
    .map((i) => `- [${i.category ?? "general"}] ${i.title}${i.source_url ? ` (${i.source_url})` : ""}: ${i.ai_summary ?? "(no summary)"}`)
    .join("\n");

  // Real content from the most substantial pages (not just one-line summaries),
  // so the analysis has genuine material to reason over.
  const keyPages = otherPages
    .filter((p) => (p.raw_content ?? "").trim().length > 200)
    .sort((a, b) => (b.raw_content?.length ?? 0) - (a.raw_content?.length ?? 0))
    .slice(0, 12)
    .map((p) => `## ${p.title}${p.source_url ? ` (${p.source_url})` : ""}\n${(p.raw_content ?? "").slice(0, 2500).trim()}`)
    .join("\n\n");

  const sourceUrl = dossier?.source_url ?? items.find((i) => i.source_url)?.source_url ?? (dna?.website ? String(dna.website) : null);

  const corpus = [
    dnaText ? `# COMPANY PROFILE (declared by the company — authoritative)\n${dnaText}` : "",
    dossier?.raw_content ? `# COMPANY DOSSIER\n${dossier.raw_content}` : "",
    catalog?.raw_content ? `# PRODUCT CATALOG\n${catalog.raw_content.slice(0, 10000)}` : "",
    keyPages ? `# KEY PAGE CONTENT (excerpts)\n${keyPages}` : "",
    summaries ? `# PAGE SUMMARIES (every page)\n${summaries}` : "",
  ].filter(Boolean).join("\n\n").slice(0, 120000);

  const systemPrompt = await renderPrompt("vault.expand");

  let content = ""; let tokens = 0;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 6000,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
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
