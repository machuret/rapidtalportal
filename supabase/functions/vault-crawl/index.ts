/**
 * Supabase Edge Function: vault-crawl
 * 
 * Handles AI-powered URL crawling for the Vault feature.
 * Uses Firecrawl for content extraction and OpenAI for structuring.
 * 
 * Moved from Next.js API route to avoid Vercel's 10-60s timeout limits.
 * This function can safely run for up to 150s (Supabase edge limit).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CONTENT_EXTRACTION_PROMPT = `You are extracting and summarizing content from a website for a company's knowledge vault.

Analyze the provided website content and extract the most important information that would be useful for virtual assistants working with this company.

Focus on:
- Key business information and processes
- Important details about services/products
- Contact information and procedures
- Policies, guidelines, or instructions
- Any information that would help VAs understand the business better

Return a JSON object with:
{
  "title": "Best title for this content (concise, descriptive)",
  "summary": "Comprehensive summary of the most important information",
  "content": "Full extracted content, well-organized and readable",
  "category": "Best category for this content (choose one: process, policy, service, contact, general, reference)",
  "importance": "How important is this content (high, medium, low)",
  "tags": ["array", "of", "relevant", "tags"]
}

Requirements:
- Extract all relevant information, not just a summary
- Organize content in a clear, readable format
- Preserve important details like names, numbers, dates
- Focus on information that would be useful for daily VA work
- If the content is not relevant to the business, indicate that in summary`;

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
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
    // ── Auth: validate JWT from Authorization header ──────────────────────────
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

    // Verify JWT using anon client (validates the user's session token)
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

    // Admin client for DB operations
    const admin = createClient(supabaseUrl, serviceKey);

    // Fetch user row for role + client_id
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
    const { url, title: providedTitle, clientId } = body;

    if (!url || !clientId) {
      return new Response(JSON.stringify({ error: "Missing url or clientId." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate URL format
    try { new URL(url); } catch {
      return new Response(JSON.stringify({ error: "Invalid URL format." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Client access check ───────────────────────────────────────────────────
    const role = (userRow as { role: string }).role;
    const userClientId = (userRow as { client_id: string | null }).client_id;
    if (role !== "super_admin" && userClientId !== clientId) {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Env checks ────────────────────────────────────────────────────────────
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

    if (!openrouterKey) {
      return new Response(JSON.stringify({ error: "OpenRouter not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: "Firecrawl not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Duplicate URL check ───────────────────────────────────────────────────
    const { data: existingItem } = await admin
      .from("vault_items")
      .select("id")
      .eq("client_id", clientId)
      .eq("source_url", url)
      .maybeSingle();

    if (existingItem) {
      return new Response(JSON.stringify({ error: "This URL already exists in your vault." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 1: Firecrawl ─────────────────────────────────────────────────────
    console.log(`🔥 Firecrawl scraping: ${url}`);
    const crawlRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });

    const crawlJson = await crawlRes.json();

    if (!crawlRes.ok || !crawlJson?.data) {
      return new Response(JSON.stringify({ error: `Firecrawl failed: ${crawlJson?.error ?? "No content returned"}` }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const websiteContent: string = crawlJson.data?.markdown ?? "";
    const extractedTitle: string = crawlJson.data?.metadata?.title ?? "";

    if (websiteContent.length < 100) {
      return new Response(JSON.stringify({ error: "Website content too short or inaccessible." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`📄 Fetched ${websiteContent.length} chars, title: "${extractedTitle}"`);

    // ── Step 2: OpenAI extraction ─────────────────────────────────────────────
    console.log("🤖 Calling OpenAI...");
    const openaiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openrouterKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: 4000,
        temperature: 0.2,
        messages: [
          { role: "system", content: CONTENT_EXTRACTION_PROMPT },
          { role: "user", content: websiteContent.slice(0, 20000) },
        ],
      }),
    });

    const openaiJson = await openaiRes.json();
    if (!openaiRes.ok) {
      return new Response(JSON.stringify({ error: `OpenAI failed: ${openaiJson?.error?.message ?? "Unknown error"}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokensUsed: number = openaiJson.usage?.total_tokens ?? 0;
    const raw: string = openaiJson.choices?.[0]?.message?.content ?? "{}";

    let extractedData: Record<string, unknown>;
    try {
      extractedData = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI response." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 3: Save to DB ────────────────────────────────────────────────────
    // Validate category — AI may return an unexpected value, so whitelist it
    const validCategories = ["process", "policy", "service", "contact", "reference", "general"];
    const category = validCategories.includes(extractedData.category as string)
      ? (extractedData.category as string)
      : "general";

    const vaultItem = {
      client_id: clientId,
      source_type: "url",
      title: providedTitle || (extractedData.title as string) || extractedTitle || url,
      source_url: url,
      raw_content: (extractedData.content as string) || websiteContent,
      // AI metadata — stored on first insert so KB/content generation has it immediately
      category,
      tags: Array.isArray(extractedData.tags) ? (extractedData.tags as string[]).slice(0, 10) : [],
      ai_summary: (extractedData.summary as string) || null,
      status: "ready",
      created_by: authUser.id,
      updated_at: new Date().toISOString(),
      updated_by: authUser.id,
    };

    const { data: result, error: dbError } = await admin
      .from("vault_items")
      .insert(vaultItem)
      .select()
      .single();

    if (dbError) {
      return new Response(JSON.stringify({ error: "Failed to save content to vault." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ Vault item saved: ${(result as { id: string }).id}`);

    return new Response(JSON.stringify({
      success: true,
      data: result,
      tokensUsed,
      summary: extractedData.summary,
      message: "Content successfully crawled and added to vault",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ vault-crawl error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal server error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
