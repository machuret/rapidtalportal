/**
 * Supabase Edge Function: kb-generate
 *
 * Generates a comprehensive FAQ knowledge base from the official Brain context
 * (Company DNA + governed Vault knowledge + learned memory + Business Library)
 * using OpenRouter. Can process 25-60 Q&A pairs and runs for 30-60 seconds —
 * well beyond Vercel's timeout limits, making this an ideal edge function.
 *
 * Context comes exclusively from the shared Brain resolver
 * (`_shared/brain-context.ts`): Vault governance filters (factual, active,
 * conflict-free, in-date) are applied there, and the exact resolved context is
 * snapshotted to `brain_context_snapshots` BEFORE the model call, like every
 * other generation surface. Do not re-derive DNA/Vault context inline.
 */

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { authorizeRequest, checkClientMembership } from "../_shared/auth.ts";
import {
  persistBrainContextSnapshot,
  renderBrainContext,
  resolveBrainContext,
} from "../_shared/brain-context.ts";
import { embedBrainMemoryQuery } from "../_shared/brain-memory-embedding.ts";

const SYSTEM_PROMPT = `You are generating a comprehensive FAQ knowledge base for a company's virtual assistants based on their Company DNA and Vault documents.

ANALYZE THE PROVIDED SOURCES THOROUGHLY:
- Company DNA contains core company information (mission, services, contact, policies)
- Vault contains detailed documents, processes, and additional company information

GENERATE 25–60 high-quality question/answer pairs that would be most useful for VAs:

PRIORITY AREAS (focus on these first):
1. Company Identity - Who we are, what we do, our mission, values, history
2. Services & Products - What we offer, features, pricing, benefits
3. Processes & Workflows - How things work, step-by-step procedures
4. Contact & Communication - How to reach people, communication protocols
5. Policies & Guidelines - Rules, best practices, compliance
6. Common Scenarios - Frequently asked questions, troubleshooting

For each entry, assign ONE of these categories: "Company Info", "Services", "Processes", "Policies", "Contact", "General", "Technical", "Billing", "Support".

Output STRICT JSON: {"entries":[{"question":"...","answer":"...","category":"...","sources":["vault_id1"]}]}.

QUALITY REQUIREMENTS:
- Questions must sound like real questions VAs would encounter
- Answers must be accurate, comprehensive yet concise (2-4 sentences typically)
- Include specific details from sources (names, dates, numbers, URLs)
- Ensure excellent distribution across all categories
- Use professional but accessible language
- Create practical, actionable answers VAs can use immediately

IMPORTANT: Only use information explicitly present in the provided sources. Do not invent facts. Business Library guidance (if present) is generic best practice, never a company fact — do not present it as something this company does.`;

const TOKEN_BUDGET = 80000;

// Broad knowledge budget: KB generation surveys the whole governed corpus, so
// it keeps the 50-document cap the previous inline Vault fetch used.
const MAX_VAULT_ITEMS = 50;

// Model (OpenRouter slug). Env-overridable so the operator can point at a
// newer model without redeploying — same pattern as VAULT_ASK_MODEL.
const KB_MODEL = Deno.env.get("KB_GENERATION_MODEL") || "openai/gpt-4o-mini";

/**
 * Admin prompt override (/admin/prompts → ai_prompts table). When a row exists
 * for the slug, it replaces the built-in default — so prompt edits go live
 * without redeploying. Cached briefly per instance; any failure falls back.
 */
const promptCache = new Map<string, { content: string | null; at: number }>();
// deno-lint-ignore no-explicit-any
async function promptOverride(admin: any, slug: string, fallback: string): Promise<string> {
  const hit = promptCache.get(slug);
  if (hit && Date.now() - hit.at < 30_000) return hit.content ?? fallback;
  try {
    const { data } = await admin.from("ai_prompts").select("content").eq("slug", slug).maybeSingle();
    const content = (data?.content as string | undefined) ?? null;
    promptCache.set(slug, { content, at: Date.now() });
    return content ?? fallback;
  } catch {
    return fallback;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return handleOptions();
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    // The Bearer check intentionally precedes the OpenRouter env check so a
    // missing key surfaces as a 500 only for requests that carry a token.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");

    if (!openrouterKey) {
      return new Response(JSON.stringify({ error: "OpenRouter not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = await authorizeRequest(req, { select: "id, role, client_id" });
    if (!auth.ok) return auth.response;
    const { admin, role, userClientId } = auth;
    const authUserId = auth.authUserId as string;

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await req.json();
    const { clientId, customCategories } = body;
    const categoryList: string[] = Array.isArray(customCategories) && customCategories.length > 0
      ? customCategories
      : ["Company Info", "Services", "Processes", "Policies", "Contact", "General", "Technical", "Billing", "Support"];

    if (!clientId) {
      return new Response(JSON.stringify({ error: "Missing clientId." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Client access ─────────────────────────────────────────────────────────
    const membershipDenied = checkClientMembership(role, userClientId, clientId);
    if (membershipDenied) return membershipDenied;

    // ── Concurrent run guard ─────────────────────────────────────────────────
    // Prevent two users from triggering KB generation at the same time.
    const { data: activeRun } = await admin
      .from("kb_generation_runs")
      .select("id, started_at")
      .eq("client_id", clientId)
      .eq("status", "running")
      .maybeSingle();

    if (activeRun) {
      return new Response(JSON.stringify({ error: "A knowledge base generation is already in progress. Please wait for it to complete." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Create run record ─────────────────────────────────────────────────────
    const { data: run, error: runError } = await admin
      .from("kb_generation_runs")
      .insert({ client_id: clientId, triggered_by: authUserId, status: "running" })
      .select()
      .single();

    if (runError || !run) {
      return new Response(JSON.stringify({ error: "Could not create run record." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const runId = (run as { id: string }).id;

    const failRun = async (msg: string) => {
      await admin
        .from("kb_generation_runs")
        .update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() })
        .eq("id", runId);
    };

    // ── Official Brain context (resolve → snapshot → render) ─────────────────
    // KB articles are generated company knowledge, so they resolve the
    // "content" surface: governed Vault evidence only (factual, active,
    // conflict-free, in-date), learned memory, and Library guidance. The exact
    // resolved context is persisted BEFORE the model call; a failure here is a
    // recoverable 503, like the other Brain surfaces.
    let context = "";
    let vaultIds: string[] = [];
    try {
      const brainContext = await resolveBrainContext({
        admin,
        clientId,
        request: {
          surface: "content",
          contentType: "knowledge_base",
          topic: "Comprehensive FAQ knowledge base for virtual assistants",
          audience: "virtual assistants",
          objective: `Generate a comprehensive FAQ knowledge base covering: ${categoryList.join(", ")}`,
          selectedVaultSourceIds: [],
          includeMarketIntelligence: false,
        },
        model: KB_MODEL,
        promptVersion: "kb.generate",
        maxKnowledge: MAX_VAULT_ITEMS,
        maxLibrary: 8,
        maxMemory: 20,
        memoryEmbed: embedBrainMemoryQuery,
        embed: async (value) => {
          // deno-lint-ignore no-explicit-any
          const session = new (globalThis as any).Supabase.ai.Session("gte-small");
          return await session.run(value, { mean_pool: true, normalize: true }) as number[];
        },
      });
      // kb_entries/kb_generation_runs have no snapshot linkage column, so the
      // snapshot carries the run id as its artifact_id (artifact_kind has a
      // CHECK constraint with no KB value — a migration would be needed to add
      // one, which is deliberately out of scope).
      await persistBrainContextSnapshot({
        admin,
        context: brainContext,
        artifactKind: null,
        artifactId: runId,
        createdBy: authUserId,
      });

      const hasCompanyDna = Object.keys(brainContext.company.fields).length > 0;
      vaultIds = brainContext.provenance.vaultItemIds;

      if (!vaultIds.length && !hasCompanyDna) {
        await failRun("No Vault items or Company DNA found.");
        return new Response(JSON.stringify({ error: "No source material available." }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      context = renderBrainContext(brainContext);
      context += `\n=== SOURCE SUMMARY ===\nCompany DNA: ${hasCompanyDna ? "Available" : "Not available"}\nVault Documents: ${vaultIds.length}\n`;

      if (!context.trim()) {
        await failRun("No readable content found in source material.");
        return new Response(JSON.stringify({ error: "No readable content." }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (error) {
      console.error("kb-generate: Brain context failed:", error);
      await failRun("The Brain could not prepare and snapshot verified context.");
      return new Response(JSON.stringify({
        error: "The Brain could not prepare and snapshot verified context. No entries were generated; please try again.",
        code: "brain_context_unavailable",
        recoverable: true,
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── OpenAI generation ─────────────────────────────────────────────────────
    console.log("🤖 Generating KB entries...");
    const baseSystem = await promptOverride(admin, "kb.generate", SYSTEM_PROMPT);
    const openaiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openrouterKey}`,
      },
      body: JSON.stringify({
        model: KB_MODEL,
        response_format: { type: "json_object" },
        max_tokens: 12000,
        temperature: 0.3,
        messages: [
          { role: "system", content: baseSystem + `\n\nFor each entry, assign ONE of these categories: ${categoryList.map(c => `"${c}"`).join(", ")}.` },
          { role: "user", content: context.slice(0, TOKEN_BUDGET * 3) },
        ],
      }),
    });

    const openaiJson = await openaiRes.json();
    if (!openaiRes.ok) {
      await failRun(`OpenAI failed: ${openaiJson?.error?.message ?? "Unknown"}`);
      return new Response(JSON.stringify({ error: "OpenAI generation failed." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokensUsed: number = openaiJson.usage?.total_tokens ?? 0;

    interface GeneratedEntry {
      question: string;
      answer: string;
      category: string;
      sources?: string[];
    }

    let entries: GeneratedEntry[] = [];
    try {
      const parsed = JSON.parse(openaiJson.choices?.[0]?.message?.content ?? "{}");
      entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch {
      await failRun("Failed to parse OpenAI JSON response.");
      return new Response(JSON.stringify({ error: "OpenAI generation failed." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validEntries = entries.filter(
      (e) => e.question?.trim().length > 10 && e.answer?.trim().length > 20 && e.category,
    );

    if (validEntries.length === 0) {
      await failRun("No valid entries generated.");
      return new Response(JSON.stringify({ error: "No valid KB entries generated." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ Generated ${validEntries.length} valid entries using ${tokensUsed} tokens`);

    // ── Persist entries — atomic replace ─────────────────────────────────────
    // Insert new entries and get back their IDs, then delete everything else.
    // This avoids the timestamp race where DB now() <= JS Date.now() causes
    // newly inserted rows to be immediately deleted by the cleanup query.
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const newRows = validEntries.map((e) => {
      const sources = (e.sources?.length ? e.sources : vaultIds)
        .filter((id: string) => uuidRegex.test(id));
      return {
        client_id: clientId,
        question: e.question.trim(),
        answer: e.answer.trim(),
        category: e.category || "General",
        source_vault_ids: sources,
      };
    });

    const { data: insertedRows, error: insertError } = await admin
      .from("kb_entries")
      .insert(newRows)
      .select("id");

    if (insertError || !insertedRows?.length) {
      const errDetail = insertError ? `${insertError.code}: ${insertError.message}` : "No rows returned";
      console.error("❌ kb_entries insert failed:", errDetail);
      await failRun(`Failed to save entries: ${errDetail}`);
      return new Response(JSON.stringify({ error: `Failed to save KB entries: ${errDetail}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete old auto-generated entries — but PRESERVE manually-edited ones
    // (is_pinned = true) and exclude the IDs we just inserted. This keeps human
    // curation intact across regenerations instead of wiping the whole KB.
    const newIds = insertedRows.map((r: { id: string }) => r.id);
    const { error: deleteError } = await admin
      .from("kb_entries")
      .delete()
      .eq("client_id", clientId)
      .eq("is_pinned", false)
      .not("id", "in", `(${newIds.join(",")})`);

    if (deleteError) {
      console.warn("⚠️  Could not clean up old kb_entries:", deleteError.message);
    }

    await admin
      .from("kb_generation_runs")
      .update({
        status: "completed",
        entries_generated: validEntries.length,
        tokens_used: tokensUsed,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    console.log(`✅ KB generation complete: ${validEntries.length} entries saved, ${tokensUsed} tokens used`);

    return new Response(JSON.stringify({ success: true, count: validEntries.length, tokensUsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ kb-generate error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal server error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
