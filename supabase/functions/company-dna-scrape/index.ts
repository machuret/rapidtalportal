/**
 * Supabase Edge Function: company-dna-scrape
 * 
 * Scrapes a company website using Firecrawl and extracts structured
 * company information via OpenAI, then persists to company_dna table.
 * 
 * Moved from Next.js to avoid Vercel timeout limits (Firecrawl + OpenAI = 15-30s).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXTRACTION_PROMPT = `You are extracting comprehensive company information from a website URL.

Analyze the provided website content and extract structured information about the company.

Return a JSON object with EXACTLY these fields (leave empty string if not found):
{
  "company_name": "Full company name",
  "services": "Main services or products offered (detailed)",
  "values": "Company values or principles",
  "phone": "Contact phone number",
  "email": "Contact email address",
  "website": "Company website URL",
  "founders": "Company founders or key leadership names",
  "target_demographic": "Target customers or market segment",
  "client_type": "Type of clients they serve"
}

Requirements:
- Only extract information that is explicitly stated on the website
- Be accurate and don't make up information
- If information is not available, use empty string
- Use exact text from website when possible
- Focus on the most important and current information`;

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

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await req.json();
    const { url, clientId } = body;

    if (!url || !clientId) {
      return new Response(JSON.stringify({ error: "Missing url or clientId." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try { new URL(url); } catch {
      return new Response(JSON.stringify({ error: "Invalid URL format." }), {
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
    if (websiteContent.length < 100) {
      return new Response(JSON.stringify({ error: "Website content too short or inaccessible." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`📄 Fetched ${websiteContent.length} chars`);

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
        max_tokens: 2000,
        temperature: 0.1,
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          { role: "user", content: websiteContent.slice(0, 15000) },
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

    const tokensUsed: number = openaiJson.usage?.total_tokens ?? 0;
    let extractedData: Record<string, string>;
    try {
      extractedData = JSON.parse(openaiJson.choices?.[0]?.message?.content ?? "{}");
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI response." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ Extracted data with ${tokensUsed} tokens`);

    // ── Step 3: Upsert company_dna ────────────────────────────────────────────
    const dnaData = {
      client_id: clientId,
      company_name: extractedData.company_name ?? "",
      services: extractedData.services ?? "",
      values: extractedData.values ?? "",
      phone: extractedData.phone ?? "",
      email: extractedData.email ?? "",
      website: extractedData.website ?? url,
      founders: extractedData.founders ?? "",
      target_demographic: extractedData.target_demographic ?? "",
      client_type: extractedData.client_type ?? "",
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: dbError } = await admin
      .from("company_dna")
      .upsert(dnaData, { onConflict: "client_id" })
      .select()
      .single();

    if (dbError) {
      console.error("DB error:", dbError);
      return new Response(JSON.stringify({ error: "Failed to save company data." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ Company DNA saved for client: ${clientId}`);

    return new Response(JSON.stringify({
      success: true,
      data: saved,
      tokensUsed,
      message: "Company information extracted and saved successfully",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ company-dna-scrape error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal server error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
