/**
 * SOP Studio AI helpers (server-only). One place for the OpenRouter call, the
 * scope-authorization, and the light grounding context so both routes stay
 * thin. Generation uses a strong model (SOPs are written rarely, quality
 * matters); suggestions use a cheap one.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { renderPrompt } from "@/lib/prompts/server";
import { chatProvider } from "@/lib/brain/llm";

// Same scope rules everywhere — re-export the ONE canonical helper so SOP
// surfaces don't each carry their own copy (was duplicated here, in
// sop-access.ts, and in the categories route).
export { authorizeScope as authorizeSopScope } from "./sop-access";

export const SUGGEST_MODEL = process.env.SOP_SUGGEST_MODEL || "openai/gpt-4o-mini";
// Default to an OpenAI model that's reliably available on our OpenRouter account.
// (anthropic/claude-3.5-sonnet returns "no endpoints" there.) Override with
// SOP_MODEL once a working Anthropic slug is confirmed.
export const GENERATE_MODEL = process.env.SOP_MODEL || "openai/gpt-4o";

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

/** Call the configured LLM (OpenRouter-preferred, OpenAI fallback) expecting a
 *  JSON object; parses + tolerates ```json fences. */
export async function llmJson<T>(model: string, system: string, user: string, maxTokens: number): Promise<LlmJsonResult<T>> {
  const llm = chatProvider();
  if (!llm) return { data: null, tokens: 0, error: "No LLM provider configured (set OPENROUTER_API_KEY or OPENAI_API_KEY)." };
  // Our SOP models are OpenRouter-namespaced ("openai/gpt-4o"); strip the
  // namespace when falling back to the OpenAI endpoint.
  const resolvedModel = llm.provider === "openai" && model.startsWith("openai/") ? model.slice("openai/".length) : model;
  try {
    const res = await fetch(llm.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.key}` },
      body: JSON.stringify({
        model: resolvedModel,
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

export interface SopDraft {
  title: string;
  intro: string;
  prerequisites: string[];
  steps: { title: string; detail: string; tip?: string }[];
}

/**
 * Generate one full SOP draft (intro + prerequisites + steps) from a topic.
 * Shared by the single-SOP generate route and the mass-produce endpoint.
 * Returns a sanitised draft or an error string — never throws.
 */
export async function generateSopDraft(
  clientId: string | null,
  opts: {
    topic: string; title?: string; category?: string;
    audience?: "new" | "experienced" | "any"; depth?: "quick" | "standard" | "thorough";
    // "Improve with AI" on an existing SOP: the current content + what to change.
    existing?: string; instruction?: string;
  },
): Promise<{ draft?: SopDraft; error?: string; tokens: number }> {
  const depthHint: Record<string, string> = {
    quick: "Keep it tight: 4-6 steps, only the essentials.",
    standard: "Aim for 6-10 well-scoped steps.",
    thorough: "Be comprehensive: 10-16 steps covering edge cases and checks.",
  };
  const audienceHint: Record<string, string> = {
    new: "Assume the reader is new — explain terms and don't skip basics.",
    experienced: "Assume an experienced operator — be concise, skip the obvious.",
    any: "Write for a capable VA who may be new to this specific task.",
  };

  const improving = !!opts.existing?.trim();
  const ctx = await clientContext(clientId);
  const system = await renderPrompt("sops.generate", {
    mode: improving ? "improving an existing" : "creating a",
    depth_hint: depthHint[opts.depth ?? "standard"],
    audience_hint: audienceHint[opts.audience ?? "any"],
    client_context: ctx,
  });
  const userMsg = [
    `Topic: ${opts.topic}`,
    opts.title ? `Preferred title/angle: ${opts.title}` : "",
    opts.category ? `Category: ${opts.category}` : "",
    improving ? `\nImprove this EXISTING SOP — keep what's correct, fix structure, clarity, gaps and ordering:\n"""\n${opts.existing!.slice(0, 40000)}\n"""` : "",
    improving && opts.instruction?.trim() ? `\nFocus of the improvement: ${opts.instruction.trim()}` : "",
  ].filter(Boolean).join("\n");

  const result = await llmJson<{ title?: string; intro?: string; prerequisites?: string[]; steps?: { title: string; detail: string; tip?: string }[] }>(
    GENERATE_MODEL, system, userMsg, 4000,
  );
  if (!result.data?.steps?.length) return { error: result.error ?? "Couldn't generate the SOP.", tokens: result.tokens };

  const steps = result.data.steps
    .filter((s) => s.title?.trim())
    .slice(0, 40)
    .map((s) => ({
      title: String(s.title).slice(0, 300),
      detail: String(s.detail ?? "").slice(0, 5000),
      ...(s.tip?.trim() ? { tip: String(s.tip).slice(0, 1000) } : {}),
    }));
  const prerequisites = Array.isArray(result.data.prerequisites)
    ? result.data.prerequisites.filter((p) => typeof p === "string" && p.trim()).slice(0, 30).map((p) => p.slice(0, 500))
    : [];

  return {
    draft: {
      title: (result.data.title || opts.title || opts.topic).slice(0, 300),
      intro: String(result.data.intro ?? "").slice(0, 5000),
      prerequisites,
      steps,
    },
    tokens: result.tokens,
  };
}
