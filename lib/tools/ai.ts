/**
 * Shared helpers for the Tools hub (server-only). One OpenRouter JSON call,
 * scope authorization (VA + admins, client-scoped), and light company
 * grounding so tools produce client-specific output. Each tool route stays
 * thin and self-contained.
 */
import { NextResponse } from "next/server";
import { assertClientAccess, type ApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const TOOL_MODEL = process.env.TOOLS_MODEL || "openai/gpt-4o";

/** Tools are for the working team: VAs + client admins, scoped to their client. */
export function authorizeTool(user: ApiUser, clientId: string): NextResponse | null {
  if (!["va", "client_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  return assertClientAccess(user, clientId);
}

export interface CompanyContext {
  companyName: string | null;
  location: string | null;
  services: string | null;
  brandVoice: string | null;
}

export async function companyContext(clientId: string): Promise<CompanyContext> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("company_dna")
      .select("company_name, location, services, brand_voice")
      .eq("client_id", clientId)
      .maybeSingle();
    const d = data as CompanyContext | null;
    return {
      companyName: d?.companyName ?? null,
      location: d?.location ?? null,
      services: d?.services ?? null,
      brandVoice: d?.brandVoice ?? null,
    };
  } catch {
    return { companyName: null, location: null, services: null, brandVoice: null };
  }
}

interface JsonResult<T> { data: T | null; tokens: number; error?: string }

/** OpenRouter call expecting a JSON object; tolerates ```json fences. */
export async function toolJson<T>(system: string, user: string, maxTokens = 2500): Promise<JsonResult<T>> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { data: null, tokens: 0, error: "OPENROUTER_API_KEY is not configured." };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: TOOL_MODEL,
        max_tokens: maxTokens,
        temperature: 0.4,
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
