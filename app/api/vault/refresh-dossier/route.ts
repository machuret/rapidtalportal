/**
 * POST /api/vault/refresh-dossier — rebuild the Company Dossier from whatever
 * is currently in the vault, so it picks up items added since the last crawl.
 *
 * Unlike the crawl pipeline (which builds dense per-page notes as it scrapes),
 * this reduces over the per-page recaps (ai_summary) already stored by
 * vault-process plus the catalog — one synthesis call, then figure
 * verification against the real page text. Upserts the dossier vault item and
 * re-embeds it. Admin-only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import { scheduleVaultProcess } from "@/lib/vault-process-trigger";
import { dossierSystemPrompt } from "@/lib/crawl/prompts";
import { verifyFigures } from "@/lib/crawl/classify";
import { briefingLimiter, tooManyRequests } from "@/lib/rate-limit";
import { errorMessage } from "@/lib/error-message";
import { serverError } from "@/lib/api/errors";

export const maxDuration = 60;

const ADMIN_ROLES = ["client_admin", "super_admin"];
const SYNTHESIS_MODEL = process.env.VAULT_DOSSIER_MODEL || "openai/gpt-4o";

const schema = z.object({ clientId: z.string().uuid() });

interface Item { id: string; title: string; source_url: string | null; ai_summary: string | null; raw_content: string | null; tags: string[] }

const isDossier = (i: Item) => (i.tags ?? []).includes("dossier") || /^company dossier/i.test(i.title);
const isCatalog = (i: Item) => /^product catalog/i.test(i.title);

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured." }, { status: 503 });

  const rl = briefingLimiter.check(`dossier:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const admin = createAdminClient();
  const { data: rows, error: itemsError } = await admin
    .from("vault_items")
    .select("id, title, source_url, ai_summary, raw_content, tags")
    .eq("client_id", parsed.data.clientId)
    .order("created_at", { ascending: false });
  if (itemsError) return serverError(itemsError, {
    userId: user.id,
    clientId: parsed.data.clientId,
    url: "/api/vault/refresh-dossier",
  });
  const items = (rows ?? []) as Item[];
  if (items.length === 0) {
    return NextResponse.json({ error: "Nothing in the vault to summarize yet." }, { status: 409 });
  }

  const existingDossier = items.find(isDossier) ?? null;
  const catalog = items.find(isCatalog) ?? null;
  const sources = items.filter((i) => !isDossier(i) && !isCatalog(i));

  const host = (() => {
    const u = existingDossier?.source_url ?? sources.find((s) => s.source_url)?.source_url;
    try { return u ? new URL(u).hostname : "this company"; } catch { return "this company"; }
  })();

  // Reduce input: per-page recaps (with raw_content fallback) + the catalog.
  const notes = sources
    .map((s) => `### ${s.title}${s.source_url ? ` (${s.source_url})` : ""}\n${s.ai_summary || (s.raw_content ?? "").slice(0, 1500)}`)
    .join("\n\n");
  const catalogSection = catalog?.raw_content ? `\n\nCATALOG:\n${catalog.raw_content.slice(0, 8000)}` : "";
  const userContent = `NOTES FROM ${sources.length} VAULT ITEMS:\n\n${notes}${catalogSection}`.slice(0, 60000);

  let dossier = ""; let tokens = 0;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: SYNTHESIS_MODEL,
        max_tokens: 4000,
        temperature: 0.2,
        messages: [
          { role: "system", content: dossierSystemPrompt(host) },
          { role: "user", content: userContent },
        ],
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: `Synthesis failed: ${errorMessage(json, `model returned ${res.status}`)}` },
        { status: 502 },
      );
    }
    dossier = json.choices?.[0]?.message?.content ?? "";
    tokens = json.usage?.total_tokens ?? 0;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Synthesis call failed." }, { status: 502 });
  }
  if (!dossier.trim()) return NextResponse.json({ error: "The model returned an empty dossier." }, { status: 502 });

  // Ground the figures against the actual stored content.
  const sourceText = items.map((i) => i.raw_content ?? i.ai_summary ?? "").join("\n");
  const { verified, unverified } = verifyFigures(dossier, sourceText);
  const verification = unverified.length
    ? `\n\n---\n\n## Verification\n${verified} figures verified against vault content. ⚠️ Could not verify: ${unverified.join(", ")} — confirm before quoting to customers.`
    : `\n\n---\n\n## Verification\nAll ${verified} quoted figures verified against vault content.`;
  const finalContent = dossier + verification;

  let dossierId: string;
  if (existingDossier) {
    const { error: updateError } = await admin
      .from("vault_items")
      .update({ raw_content: finalContent, status: "processing", updated_at: new Date().toISOString(), updated_by: user.id })
      .eq("id", existingDossier.id);
    if (updateError) return serverError(updateError, {
      userId: user.id,
      clientId: parsed.data.clientId,
      url: "/api/vault/refresh-dossier",
    });
    dossierId = existingDossier.id;
  } else {
    const { data: created, error } = await admin
      .from("vault_items")
      .insert({
        client_id: parsed.data.clientId,
        source_type: "text",
        title: `Company Dossier — ${host}`,
        source_url: sources.find((s) => s.source_url)?.source_url ?? null,
        raw_content: finalContent,
        category: "reference",
        tags: ["dossier", "website", host],
        meta_curated: true,
        status: "processing",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !created) return serverError(error ?? new Error("Dossier insert returned no row."), {
      userId: user.id,
      clientId: parsed.data.clientId,
      url: "/api/vault/refresh-dossier",
    });
    dossierId = (created as { id: string }).id;
  }

  scheduleVaultProcess(dossierId, parsed.data.clientId);

  return NextResponse.json({ ok: true, dossierId, unverified, tokensUsed: tokens, itemsSummarized: sources.length });
}, { roles: ADMIN_ROLES });
