/**
 * Supabase Edge Function: kb-generate
 * 
 * Generates a comprehensive FAQ knowledge base from Company DNA + Vault items
 * using OpenAI. Can process 25-60 Q&A pairs and runs for 30-60 seconds —
 * well beyond Vercel's timeout limits, making this an ideal edge function.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

IMPORTANT: Only use information explicitly present in the provided sources. Do not invent facts.`;

const TOKEN_BUDGET = 80000;

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
    const role = (userRow as { role: string }).role;
    const userClientId = (userRow as { client_id: string | null }).client_id;
    if (role !== "super_admin" && userClientId !== clientId) {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      .insert({ client_id: clientId, triggered_by: authUser.id, status: "running" })
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

    // ── Fetch source data ─────────────────────────────────────────────────────
    // Prioritise items with ai_summary (signal-dense) to stay within token budget.
    // Cap at 50 items to prevent OOM on large vaults — raw_content can be huge.
    const MAX_VAULT_ITEMS = 50;
    const [{ data: allVaultItems }, { data: dna }] = await Promise.all([
      admin.from("vault_items").select("id,title,raw_content,category,tags,ai_summary").eq("client_id", clientId).eq("status", "ready").order("updated_at", { ascending: false }).limit(MAX_VAULT_ITEMS * 2),
      admin.from("company_dna").select("*").eq("client_id", clientId).single(),
    ]);

    // Sort: items with ai_summary first (richer signal), then by recency. Cap at 50.
    type VaultFetchRow = { id: string; title: string; raw_content: string | null; category: string | null; tags: string[]; ai_summary: string | null };
    const vaultItems = ((allVaultItems ?? []) as VaultFetchRow[])
      .sort((a, b) => {
        if (a.ai_summary && !b.ai_summary) return -1;
        if (!a.ai_summary && b.ai_summary) return 1;
        return 0;
      })
      .slice(0, MAX_VAULT_ITEMS);

    if (!vaultItems.length && !dna) {
      await failRun("No Vault items or Company DNA found.");
      return new Response(JSON.stringify({ error: "No source material available." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Build context ─────────────────────────────────────────────────────────
    let context = "";
    const vaultIds: string[] = [];

    if (dna) {
      context += "=== COMPANY DNA (CORE INFORMATION) ===\n";
      const dnaRow = dna as Record<string, unknown>;
      const priorityFields = [
        "company_name", "mission", "services", "values", "description",
        "phone", "email", "website", "address", "founders",
        "target_demographic", "client_type", "extra",
      ];
      for (const field of priorityFields) {
        const value = dnaRow[field];
        if (value && typeof value === "string" && value.trim()) {
          context += `${field.toUpperCase()}: ${value.trim()}\n`;
        }
      }
      context += "\n";
    }

    if (vaultItems.length) {
      // Category-aware sections: AI knows what type of content it's reading,
      // improving routing for SOP (process), KB Q&A (service/policy), contacts, etc.
      const categoryOrder = ["process", "policy", "service", "contact", "reference", "general"] as const;
      type VaultRow = { id: string; title: string; raw_content: string | null; category: string | null; tags: string[]; ai_summary: string | null };
      const byCategory: Record<string, VaultRow[]> = {};
      for (const item of vaultItems as unknown as VaultRow[]) {
        const cat = item.category ?? "general";
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(item);
      }

      const categoryLabels: Record<string, string> = {
        process: "PROCESS DOCUMENTS (workflows, how-to guides, onboarding)",
        policy: "POLICY DOCUMENTS (rules, guidelines, compliance)",
        service: "SERVICE & PRODUCT DOCUMENTS (offerings, pricing, features)",
        contact: "CONTACT INFORMATION (people, numbers, addresses, suppliers)",
        reference: "REFERENCE MATERIAL (background info, FAQs, glossaries)",
        general: "GENERAL DOCUMENTS",
      };

      for (const cat of categoryOrder) {
        const items = byCategory[cat];
        if (!items?.length) continue;
        context += `\n=== ${categoryLabels[cat]} ===\n`;
        for (const row of items) {
          if (!row.raw_content?.trim()) continue;
          // Include AI summary as a quick digest before the full content
          const summaryLine = row.ai_summary ? `SUMMARY: ${row.ai_summary}\n` : "";
          const tagsLine = row.tags?.length ? `TAGS: ${row.tags.join(", ")}\n` : "";
          const chunk = `DOCUMENT: ${row.title}\n${summaryLine}${tagsLine}${row.raw_content.trim()}\n\n`;
          if ((context + chunk).length > TOKEN_BUDGET * 3) break;
          context += chunk;
          vaultIds.push(row.id);
        }
      }
    }

    context += `\n=== SOURCE SUMMARY ===\nCompany DNA: ${dna ? "Available" : "Not available"}\nVault Documents: ${vaultIds.length}\n`;

    if (!context.trim()) {
      await failRun("No readable content found in source material.");
      return new Response(JSON.stringify({ error: "No readable content." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── OpenAI generation ─────────────────────────────────────────────────────
    console.log("🤖 Generating KB entries...");
    const openaiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openrouterKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        response_format: { type: "json_object" },
        max_tokens: 12000,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + `\n\nFor each entry, assign ONE of these categories: ${categoryList.map(c => `"${c}"`).join(", ")}.` },
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
