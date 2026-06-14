/**
 * Supabase Edge Function: content-generate
 * 
 * Generates business content (emails, social posts, newsletters, blog posts)
 * using OpenAI with Company DNA + Vault context. Runs globally at the edge
 * with no cold starts and consistent sub-second response initiation.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TYPE_PROMPTS: Record<string, string> = {
  email: `Write a professional business email. Structure: subject line, greeting, body paragraphs, clear call-to-action, sign-off. Keep it concise and scannable.`,
  social: `Write engaging social media content. Create 3 variations: one for LinkedIn (professional, 150-200 words), one for Facebook (conversational, 100-150 words), one for Instagram (punchy, 80-100 words + hashtag suggestions).`,
  newsletter: `Write a client newsletter. Structure: compelling headline, intro hook, 2-3 main sections with subheadings, a featured insight or tip, and a clear CTA. Aim for 400-600 words.`,
  blog: `Write a blog post. Structure: SEO-friendly title, engaging intro, 3-5 sections with H2 subheadings, practical content with examples, conclusion with CTA. Aim for 600-900 words.`,
};

const LENGTH_HINTS: Record<string, string> = {
  short: "Keep it brief and punchy.",
  medium: "Aim for a standard length appropriate to the format.",
  long: "Be comprehensive and detailed.",
};

// Default base system prompt — kept in sync with the "content.generate" entry
// in lib/prompts/registry.ts so that saving the default in admin resets cleanly.
const DEFAULT_SYSTEM = `You are an expert content writer for a business.
Use the company context and reference material provided to write content that is authentic and on-brand.
Only use facts present in the provided context.
Tone: [[tone]]. [[length_hint]]
[[type_prompt]]`;

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

function renderTemplate(t: string, vars: Record<string, string>): string {
  return t.replace(/\[\[(\w+)\]\]/g, (_m, k) => vars[k] ?? "");
}

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
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");

    if (!openrouterKey) {
      return new Response(JSON.stringify({ error: "OpenRouter not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userRow } = await admin
      .from("users")
      .select("id, role, client_id")
      .eq("id", authUser.id)
      .single();

    if (!userRow) {
      return new Response(JSON.stringify({ error: "User record not found." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse + validate body ─────────────────────────────────────────────────
    const body = await req.json();
    const { clientId, contentType, title, brief, tone = "professional", length = "medium" } = body;

    if (!clientId || !contentType || !title || !brief) {
      return new Response(JSON.stringify({ error: "Missing required fields: clientId, contentType, title, brief." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validTypes = ["email", "social", "newsletter", "blog"];
    if (!validTypes.includes(contentType)) {
      return new Response(JSON.stringify({ error: `Invalid contentType. Must be one of: ${validTypes.join(", ")}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Client access ─────────────────────────────────────────────────────────
    const role = (userRow as { role: string }).role;
    const userClientId = (userRow as { client_id: string | null }).client_id;
    if (role !== "super_admin" && userClientId !== clientId) {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch context: DNA + category-relevant vault items ──────────────────────
    // Content type determines which vault categories are most relevant:
    // - email/social/newsletter/ad: service and general items (brand voice, offerings)
    // - blog/article: reference and process items (depth, expertise)
    // - sop/procedure: process and policy items (workflows, rules)
    const CATEGORY_RELEVANCE: Record<string, string[]> = {
      email:      ["service", "general", "policy", "contact"],
      social:     ["service", "general", "reference"],
      newsletter: ["service", "general", "reference", "process"],
      ad:         ["service", "general"],
      blog:       ["reference", "process", "service", "general"],
      article:    ["reference", "process", "policy", "general"],
      sop:        ["process", "policy", "reference", "general"],
      procedure:  ["process", "policy", "service"],
    };
    const relevantCats = CATEGORY_RELEVANCE[contentType as string] ?? ["service", "general", "reference", "process"];

    const [{ data: dna }, { data: allVaultItems }] = await Promise.all([
      admin.from("company_dna").select("company_name,values,services,target_demographic,location,business_goals,marketing_goals,team,tools_used,content_style,brand_voice,internal_rules,extra").eq("client_id", clientId).maybeSingle(),
      // Fetch up to 30 items, then sort by category relevance client-side
      admin.from("vault_items").select("title,raw_content,category,ai_summary").eq("client_id", clientId).eq("status", "ready").order("created_at", { ascending: false }).limit(30),
    ]);

    // Sort by relevance: items in relevant categories first, then others
    type VaultCtxRow = { title: string; raw_content: string | null; category: string | null; ai_summary: string | null };
    const vaultItems = ((allVaultItems ?? []) as VaultCtxRow[]).sort((a, b) => {
      const ai = relevantCats.indexOf(a.category ?? "general");
      const bi = relevantCats.indexOf(b.category ?? "general");
      // Not-found (-1) sorts last
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }).slice(0, 15); // Top 15 most relevant items (was 8)

    let context = "";
    if (dna) {
      const d = dna as Record<string, unknown>;
      context += "=== COMPANY CONTEXT ===\n";
      for (const [k, v] of Object.entries(d)) {
        if (v && typeof v === "string") context += `${k}: ${v}\n`;
      }
      context += "\n";
    }
    if (vaultItems?.length) {
      context += "=== REFERENCE MATERIAL ===\n";
      for (const item of vaultItems) {
        // Prefer ai_summary as dense signal; fall back to raw_content with bigger window (3000 chars)
        const body = item.ai_summary
          ? `${item.ai_summary}\n${item.raw_content?.slice(0, 1500) ?? ""}`
          : (item.raw_content?.slice(0, 3000) ?? "");
        if (!body.trim()) continue;
        context += `--- ${item.title} ---\n${body}\n\n`;
      }
    }

    // Brain memory — learned preferences & rules the draft must honour.
    const { data: memRows } = await admin.from("brain_memory")
      .select("kind, content").eq("client_id", clientId).eq("active", true)
      .order("pinned", { ascending: false }).limit(20);
    const mem = (memRows ?? []) as { kind: string; content: string }[];
    if (mem.length) {
      const memLabel: Record<string, string> = { preference: "Prefer", anti_pattern: "Avoid", rule: "Rule" };
      context += "=== COMPANY PREFERENCES & RULES (learned — follow these) ===\n";
      for (const m of mem) context += `${memLabel[m.kind] ?? "Note"}: ${m.content}\n`;
      context += "\n";
    }

    // ── OpenAI generation ─────────────────────────────────────────────────────
    const baseTemplate = await promptOverride(admin, "content.generate", DEFAULT_SYSTEM);
    const systemPrompt = renderTemplate(baseTemplate, {
      tone,
      length_hint: LENGTH_HINTS[length] ?? "",
      type_prompt: TYPE_PROMPTS[contentType] ?? "",
    });

    const userPrompt = `${context}\n=== CONTENT REQUEST ===\nType: ${contentType}\nTitle: ${title}\nBrief: ${brief}`;

    console.log(`✍️ Generating ${contentType} content...`);
    const openaiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openrouterKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        max_tokens: 4000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const openaiJson = await openaiRes.json();
    if (!openaiRes.ok) {
      return new Response(JSON.stringify({ error: `OpenAI failed: ${openaiJson?.error?.message ?? "Unknown"}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const generatedBody: string = openaiJson.choices?.[0]?.message?.content ?? "";
    if (!generatedBody.trim()) {
      return new Response(JSON.stringify({ error: "AI returned empty content. Try a more specific brief." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Save draft ────────────────────────────────────────────────────────────
    const { data: piece, error: dbError } = await admin
      .from("content_pieces")
      .insert({
        client_id: clientId,
        content_type: contentType,
        title,
        brief,
        body: generatedBody,
        status: "draft",
        created_by: authUser.id,
      })
      .select("id")
      .single();

    if (dbError) {
      return new Response(JSON.stringify({ error: dbError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ Content saved: ${(piece as { id: string }).id}`);

    return new Response(JSON.stringify({
      success: true,
      id: (piece as { id: string }).id,
      body: generatedBody,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ content-generate error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal server error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
