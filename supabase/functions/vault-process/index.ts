/**
 * vault-process — AI metadata extraction for existing vault items
 *
 * Purpose: Extract/refresh ai_summary, category, and tags from a vault item's
 *          raw_content using OpenAI. Can be called after initial insert or
 *          triggered manually by a re-process request.
 *
 * Called by:
 *   - vault-crawl (internally after URL crawl insert)
 *   - /api/vault/[id]/reprocess (manual re-process from UI)
 *   - /api/vault/[id] PATCH (after content edit)
 *
 * DB Reads:  vault_items (raw_content, client_id, status)
 * DB Writes: vault_items (category, tags, ai_summary, status, error_message, updated_at)
 *
 * Auth:    Bearer JWT → getUser() → DB user row → client membership check
 * Secrets: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 * Timeout: ~15s (OpenAI gpt-4o-mini only — no Firecrawl)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** OpenAI prompt — produces structured JSON with exactly the fields we store */
const PROCESS_PROMPT = `You are an AI assistant that analyses business documents for a knowledge management system.

Given the document content, return a JSON object with EXACTLY these fields:

{
  "ai_summary": "2-3 sentence summary of what this document is about and why it matters for the business",
  "category": "ONE of: process, policy, service, contact, reference, general",
  "tags": ["array", "of", "3-8", "relevant", "keyword", "tags"]
}

Category guide:
- process: step-by-step workflows, how-to guides, procedures, onboarding
- policy: rules, guidelines, compliance, terms, restrictions
- service: products offered, pricing, features, packages, service descriptions
- contact: people, phone numbers, emails, addresses, suppliers, clients
- reference: background info, industry knowledge, glossaries, FAQs
- general: anything that doesn't fit above

Requirements:
- ai_summary must be useful for a VA reading it quickly — practical, specific
- tags must be lowercase single words or short phrases, no punctuation
- category must be exactly one of the six options listed`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Use service role for all DB ops — bypasses RLS safely server-side
    const admin = createClient(supabaseUrl, serviceKey);

    // Two kinds of caller:
    //   (a) A logged-in user (UI "reprocess") presenting their own JWT.
    //   (b) A trusted server-to-server call (the post-ingest trigger in
    //       lib/vault-process-trigger.ts) presenting the service-role key.
    // For (b) we skip the user/role checks — only our own backend holds the
    // service-role key — and rely on the clientId-scoped item fetch below.
    const isInternal = jwt === serviceKey;

    let actorId: string | null = null;
    let role = "super_admin";
    let userClientId: string | null = null;

    if (!isInternal) {
      // Validate JWT using anon client — getUser() is the secure server-side check
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
      if (authError || !authUser) {
        return new Response(JSON.stringify({ error: "Unauthorized." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch user row to verify role and client membership
      const { data: userRow } = await admin
        .from("users")
        .select("role, client_id")
        .eq("id", authUser.id)
        .single();

      if (!userRow) {
        return new Response(JSON.stringify({ error: "User record not found." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      actorId = authUser.id;
      role = (userRow as { role: string }).role;
      userClientId = (userRow as { client_id: string | null }).client_id;
    }

    // ── Validate input ────────────────────────────────────────────────────────
    const body = await req.json();
    const { itemId, clientId } = body;

    if (!itemId || !clientId) {
      return new Response(JSON.stringify({ error: "Missing itemId or clientId." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Client membership check — super_admin (and trusted internal calls) can
    // process any client's items; everyone else must match their own client.
    if (!isInternal && role !== "super_admin" && userClientId !== clientId) {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch vault item ──────────────────────────────────────────────────────
    const { data: item, error: fetchErr } = await admin
      .from("vault_items")
      .select("id, client_id, raw_content, status")
      .eq("id", itemId)
      .eq("client_id", clientId) // Double-check ownership — never trust clientId alone
      .maybeSingle();

    if (fetchErr || !item) {
      return new Response(JSON.stringify({ error: "Vault item not found or access denied." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawContent = (item as { raw_content: string | null }).raw_content ?? "";

    // Guard: content must be substantive enough for AI to analyse
    if (rawContent.trim().length < 50) {
      return new Response(JSON.stringify({ error: "Content too short to process (minimum 50 characters)." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Env check ─────────────────────────────────────────────────────────────
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OpenAI not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as processing before calling OpenAI — UI can show live status via Realtime
    await admin
      .from("vault_items")
      .update({ status: "processing", updated_at: new Date().toISOString(), updated_by: actorId })
      .eq("id", itemId);

    // ── OpenAI extraction ─────────────────────────────────────────────────────
    console.log(`🤖 vault-process: analysing item ${itemId}`);
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: 500, // Summary + category + tags only — keep cost low
        temperature: 0.1, // Low temp = consistent categorisation
        messages: [
          { role: "system", content: PROCESS_PROMPT },
          { role: "user", content: rawContent.slice(0, 15000) }, // Cap input tokens
        ],
      }),
    });

    const openaiJson = await openaiRes.json();

    if (!openaiRes.ok) {
      // Write error back to item so client can see it in the UI
      await admin
        .from("vault_items")
        .update({
          status: "error",
          error_message: `OpenAI error: ${openaiJson?.error?.message ?? "Unknown"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId);
      return new Response(JSON.stringify({ error: "OpenAI call failed." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokensUsed: number = openaiJson.usage?.total_tokens ?? 0;
    const raw: string = openaiJson.choices?.[0]?.message?.content ?? "{}";

    let extracted: { ai_summary?: string; category?: string; tags?: string[] };
    try {
      extracted = JSON.parse(raw);
    } catch {
      await admin
        .from("vault_items")
        .update({ status: "error", error_message: "Failed to parse AI response.", updated_at: new Date().toISOString() })
        .eq("id", itemId);
      return new Response(JSON.stringify({ error: "Failed to parse AI response." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate category — fall back to 'general' if AI returned something invalid
    const validCategories = ["process", "policy", "service", "contact", "reference", "general"];
    const category = validCategories.includes(extracted.category ?? "") ? extracted.category : "general";

    // ── Persist results ───────────────────────────────────────────────────────
    const { data: updated, error: updateErr } = await admin
      .from("vault_items")
      .update({
        ai_summary: extracted.ai_summary ?? null,
        category,
        tags: Array.isArray(extracted.tags) ? extracted.tags.slice(0, 10) : [], // Cap at 10 tags
        status: "ready",
        error_message: null, // Clear any previous error
        updated_at: new Date().toISOString(),
        updated_by: actorId,
      })
      .eq("id", itemId)
      .select()
      .single();

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Failed to save AI results." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ vault-process complete: ${itemId} → category=${category}, tokens=${tokensUsed}`);

    return new Response(JSON.stringify({
      success: true,
      data: updated,
      tokensUsed,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ vault-process error:", error);

    // Best-effort: if we know the itemId, write the error back to the DB so the
    // item doesn't stay permanently stuck at 'processing'. We don't have itemId
    // in scope here if the body parse failed, so we guard with a try/catch.
    try {
      const bodyText = await (req.clone() as Request).text();
      const parsed = JSON.parse(bodyText) as { itemId?: string };
      if (parsed?.itemId) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const { createClient: createAdminClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const admin = createAdminClient(supabaseUrl, serviceKey);
        await admin
          .from("vault_items")
          .update({ status: "error", error_message: error instanceof Error ? error.message : "Unexpected error", updated_at: new Date().toISOString() })
          .eq("id", parsed.itemId);
      }
    } catch { /* body already consumed or DB unavailable — cannot recover status */ }

    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal server error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
