/**
 * Shared helpers for the Tools hub (server-only). One OpenRouter JSON call,
 * scope authorization (VA + admins, client-scoped), and light company
 * grounding so tools produce client-specific output. Each tool route stays
 * thin and self-contained.
 */
import { NextResponse } from "next/server";
import { assertClientAccess, type ApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/error-tracking";

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
    // Map snake_case DB columns explicitly. (A previous `as CompanyContext`
    // cast read camelCase keys off a snake_case row, silently nulling
    // companyName/brandVoice in every tool — never cast across casings.)
    const d = data as { company_name: string | null; location: string | null; services: string | null; brand_voice: string | null } | null;
    return {
      companyName: d?.company_name ?? null,
      location: d?.location ?? null,
      services: d?.services ?? null,
      brandVoice: d?.brand_voice ?? null,
    };
  } catch {
    return { companyName: null, location: null, services: null, brandVoice: null };
  }
}

/** Fire-and-forget usage record — feeds /tools history + Supervision stats. */
export function logToolRun(tool: string, clientId: string, userId: string, inputSummary: string, tokens: number): void {
  try {
    const admin = createAdminClient();
    void admin
      .from("tool_runs")
      .insert({ client_id: clientId, user_id: userId, tool, input_summary: inputSummary.slice(0, 200), tokens_used: tokens })
      .then(({ error }) => { if (error) console.warn("[tool_runs]", error.message); });
  } catch { /* never block the tool result */ }
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
    if (!res.ok) {
      // Handled failure, but surface it in /admin/errors — if a model starts
      // failing a chunk of calls, the admin should see it, not just users.
      captureError("api", new Error(`Tool AI call failed: ${json?.error?.message ?? res.status}`), { url: "tools:llm" });
      return { data: null, tokens: 0, error: json?.error?.message ?? `Model returned ${res.status}` };
    }
    const raw: string = json.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    try {
      return { data: JSON.parse(cleaned) as T, tokens: json.usage?.total_tokens ?? 0 };
    } catch {
      // Almost always a truncated response (max_tokens hit mid-JSON).
      captureError("api", new Error(`Tool AI returned unparseable JSON (likely truncated; ${cleaned.length} chars, max_tokens ${maxTokens})`), { url: "tools:llm" });
      return { data: null, tokens: json.usage?.total_tokens ?? 0, error: "The AI response was cut off. Try again — or use a shorter input." };
    }
  } catch (err) {
    captureError("api", err, { url: "tools:llm" });
    return { data: null, tokens: 0, error: err instanceof Error ? err.message : "AI request failed." };
  }
}
