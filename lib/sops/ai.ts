/**
 * SOP Studio AI helpers (server-only). One place for the OpenRouter call, the
 * scope-authorization, and the light grounding context so both routes stay
 * thin. Generation uses a strong model (SOPs are written rarely, quality
 * matters); suggestions use a cheap one.
 */
import { NextResponse } from "next/server";
import { assertClientAccess, type ApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const SUGGEST_MODEL = process.env.SOP_SUGGEST_MODEL || "openai/gpt-4o-mini";
// Default to an OpenAI model that's reliably available on our OpenRouter account.
// (anthropic/claude-3.5-sonnet returns "no endpoints" there.) Override with
// SOP_MODEL once a working Anthropic slug is confirmed.
export const GENERATE_MODEL = process.env.SOP_MODEL || "openai/gpt-4o";

/** Same scope rules as the SOPs write route: global = super_admin, client = admins. */
export function authorizeSopScope(user: ApiUser, clientId: string | null): NextResponse | null {
  if (clientId === null) {
    if (user.role !== "super_admin") {
      return NextResponse.json({ error: "Only RapidTal admins can author global library SOPs." }, { status: 403 });
    }
    return null;
  }
  if (!["client_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Only admins can author SOPs." }, { status: 403 });
  }
  return assertClientAccess(user, clientId);
}

/** Light company context so client SOPs reference their real tools/brand. */
export async function clientContext(clientId: string | null): Promise<string> {
  if (!clientId) return "";
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("company_dna")
      .select("company_name, services, client_type, target_demographic")
      .eq("client_id", clientId)
      .maybeSingle();
    const dna = data as { company_name: string | null; services: string | null; client_type: string | null; target_demographic: string | null } | null;
    if (!dna) return "";
    const bits = [
      dna.company_name && `Company: ${dna.company_name}`,
      dna.client_type && `Type: ${dna.client_type}`,
      dna.services && `Services: ${dna.services}`,
      dna.target_demographic && `Audience: ${dna.target_demographic}`,
    ].filter(Boolean);
    return bits.length ? `\n\nThis SOP is for a specific company — tailor it to them where relevant:\n${bits.join("\n")}` : "";
  } catch {
    return "";
  }
}

interface LlmJsonResult<T> { data: T | null; tokens: number; error?: string }

/** Call OpenRouter expecting a JSON object; parses + tolerates ```json fences. */
export async function llmJson<T>(model: string, system: string, user: string, maxTokens: number): Promise<LlmJsonResult<T>> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { data: null, tokens: 0, error: "OPENROUTER_API_KEY is not configured." };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    const json = await res.json();
    if (!res.ok) return { data: null, tokens: 0, error: json?.error?.message ?? `Model returned ${res.status}` };
    const raw: string = json.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    return { data: JSON.parse(cleaned) as T, tokens: json.usage?.total_tokens ?? 0 };
  } catch (err) {
    return { data: null, tokens: 0, error: err instanceof Error ? err.message : "AI request failed." };
  }
}
