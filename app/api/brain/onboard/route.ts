/**
 * POST /api/brain/onboard — effortless onboarding (Brain 2.0, Milestone F).
 *
 * Drafts values for the empty, draftable company-profile fields, grounded in the
 * client's own Vault documents, and returns them for review (no write — the
 * existing Company DNA form fills the empty fields and the admin saves as usual).
 *
 * Admins only. Never invents: a field is omitted if the documents don't support it.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileGaps } from "@/lib/brain/gaps";

const schema = z.object({ client_id: z.string().uuid() });

const DRAFT_MODEL = process.env.BRAIN_DISTILL_MODEL ?? "gpt-4o-mini";

export const POST = withAuth(async (req, { user }) => {
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;
  if (user.role !== "client_admin" && user.role !== "super_admin") {
    return NextResponse.json({ error: "Only admins can edit the company profile." }, { status: 403 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return NextResponse.json({ error: "AI not configured." }, { status: 500 });

  const admin = createAdminClient();
  const clientId = parsed.data.client_id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;

  const { data: dna } = await a.from("company_dna").select("*").eq("client_id", clientId).maybeSingle();
  const targets = profileGaps(dna ?? null).draftableGaps;
  if (targets.length === 0) return NextResponse.json({ drafts: {}, complete: true });

  const { data: vaultRows } = await a
    .from("vault_items")
    .select("title, ai_summary, raw_content")
    .eq("client_id", clientId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(20);
  const vault = (vaultRows ?? []) as { title: string; ai_summary: string | null; raw_content: string | null }[];

  let knowledge = "";
  for (const v of vault) {
    const snippet = v.ai_summary ?? v.raw_content?.slice(0, 1500) ?? "";
    if (!snippet.trim()) continue;
    const entry = `--- ${v.title} ---\n${snippet}\n\n`;
    if (knowledge.length + entry.length > 12000) break;
    knowledge += entry;
  }
  if (!knowledge.trim()) return NextResponse.json({ drafts: {}, noVault: true });

  const fieldList = targets.map((f) => `- ${f.key}: ${f.question}`).join("\n");
  const prompt =
    `From the company's own documents below, draft concise values for these company-profile fields. ` +
    `Only use facts present in the documents. If the documents don't support a field, omit it entirely (don't guess).\n\n` +
    `FIELDS TO DRAFT:\n${fieldList}\n\n=== COMPANY DOCUMENTS ===\n${knowledge}\n\n` +
    `Return JSON: { "drafts": { "<field_key>": "<short value>", ... } }. Keep each value tight (1-3 sentences).`;

  const drafts: Record<string, string> = {};
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: DRAFT_MODEL, temperature: 0.3, max_tokens: 1500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You draft an accurate company profile strictly from the company's own documents. Never invent facts; omit fields the documents don't support." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (res.ok) {
      const json = await res.json();
      const out = (JSON.parse(json.choices?.[0]?.message?.content ?? "{}")?.drafts ?? {}) as Record<string, unknown>;
      for (const f of targets) {
        const v = out[f.key];
        if (typeof v === "string" && v.trim()) drafts[f.key] = v.trim();
      }
    } else {
      console.error("[brain/onboard] OpenAI", res.status);
    }
  } catch (e) {
    console.error("[brain/onboard] fetch", e);
  }

  return NextResponse.json({
    drafts,
    fields: targets.filter((f) => drafts[f.key]).map((f) => ({ key: f.key, label: f.label })),
  });
});
