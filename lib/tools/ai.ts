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
import { salvageJson } from "@/lib/tools/json-salvage";
import {
  persistNodeBrainContextSnapshot,
  resolveNodeBrainContext,
} from "@/lib/brain/resolver";

export const TOOL_MODEL = process.env.TOOLS_MODEL || "openai/gpt-4o";
// High-frequency, low-complexity tools (hashtags, hooks, replies) run on a
// mini-class model: ~2-3x faster, ~10x cheaper, quality holds for short-form.
export const TOOL_MODEL_MINI = process.env.TOOLS_MODEL_MINI || "openai/gpt-4o-mini";

// The cold-outreach house style now lives in the prompt registry as
// "style.outreach" (admin-editable) — fetch it via getPromptTemplate.

/** Enforce "no em/en dashes" defensively — the model sometimes ignores it. */
export function stripDashes(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",");
}

/** Clamp a model-returned value to a safe string of at most `max` chars. */
export const clampStr = (v: unknown, max: number): string => String(v ?? "").slice(0, max);
/** Coerce to an array (model may omit it) and cap its length. */
export const clampArr = <T>(v: T[] | undefined | null, max: number): T[] =>
  (Array.isArray(v) ? v : []).slice(0, max);

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

// Company DNA changes rarely; a short TTL cache spares every tool call a DB
// round-trip while still picking up edits within ~30s (same approach as the
// prompt cache). Per serverless instance — a speed-up, not a correctness need.
const CTX_TTL_MS = 30_000;
const ctxCache = new Map<string, { ctx: CompanyContext; at: number }>();

export async function companyContext(clientId: string): Promise<CompanyContext> {
  const hit = ctxCache.get(clientId);
  if (hit && Date.now() - hit.at < CTX_TTL_MS) return hit.ctx;
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
    const ctx: CompanyContext = {
      companyName: d?.company_name ?? null,
      location: d?.location ?? null,
      services: d?.services ?? null,
      brandVoice: d?.brand_voice ?? null,
    };
    ctxCache.set(clientId, { ctx, at: Date.now() });
    return ctx;
  } catch {
    // Don't cache failures — let the next call retry.
    return { companyName: null, location: null, services: null, brandVoice: null };
  }
}

/** Fire-and-forget usage record — feeds /tools history + Supervision stats.
 *  Pass the response payload as `output` to make the run reopenable. */
export function logToolRun(
  tool: string,
  clientId: string,
  userId: string,
  inputSummary: string,
  tokens: number,
  output?: unknown,
  brainContextSnapshotId?: string | null,
): void {
  try {
    const admin = createAdminClient();
    void admin
      .from("tool_runs")
      .insert({
        client_id: clientId,
        user_id: userId,
        tool,
        input_summary: inputSummary.slice(0, 200),
        tokens_used: tokens,
        output: (output as Record<string, unknown> | undefined) ?? null,
        brain_context_snapshot_id: brainContextSnapshotId ?? null,
      })
      .then(({ error }) => { if (error) console.warn("[tool_runs]", error.message); });
  } catch { /* never block the tool result */ }
}

interface JsonResult<T> {
  data: T | null;
  tokens: number;
  error?: string;
  brainContextSnapshotId?: string | null;
}

/**
 * OpenRouter call expecting a JSON object; tolerates ```json fences.
 *
 * Pass `groundingClientId` to prepend the client's Brain grounding (profile +
 * Vault highlights + learned lessons) to the user message, so the tool's output
 * reflects what worked/was rejected for this client. Best-effort and cached.
 */
export async function toolJson<T>(
  system: string,
  user: string,
  maxTokens = 2500,
  model: string = TOOL_MODEL,
  groundingClientId?: string,
): Promise<JsonResult<T>> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { data: null, tokens: 0, error: "OPENROUTER_API_KEY is not configured." };
  let brainContextSnapshotId: string | null = null;
  let grounding = "";
  if (groundingClientId) {
    const admin = createAdminClient();
    try {
      const resolved = await resolveNodeBrainContext({
        admin,
        clientId: groundingClientId,
        request: {
          surface: "tool",
          topic: user.slice(0, 2_000),
          intent: system.slice(0, 1_000),
          selectedVaultSourceIds: [],
          includeMarketIntelligence: false,
        },
        model,
        promptVersion: "tool-json-v1",
        maxKnowledge: 8,
        maxLibrary: 5,
        maxMemory: 15,
      });
      grounding = resolved.prompt;
      const snapshot = await persistNodeBrainContextSnapshot({
        admin,
        context: resolved.context,
        artifactKind: "tool_run",
      });
      brainContextSnapshotId = snapshot.id;
    } catch (error) {
      captureError("api", error, { url: "tools:brain-context" });
      return {
        data: null,
        tokens: 0,
        error: "The company context could not be prepared. Please try again.",
      };
    }
  }
  const userContent = `${grounding}${user}`;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: userContent }],
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      // Handled failure, but surface it in /admin/errors — if a model starts
      // failing a chunk of calls, the admin should see it, not just users.
      captureError("api", new Error(`Tool AI call failed: ${json?.error?.message ?? res.status}`), { url: "tools:llm" });
      return {
        data: null,
        tokens: 0,
        error: json?.error?.message ?? `Model returned ${res.status}`,
        brainContextSnapshotId,
      };
    }
    const raw: string = json.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const tokens: number = json.usage?.total_tokens ?? 0;
    try {
      return { data: JSON.parse(cleaned) as T, tokens, brainContextSnapshotId };
    } catch {
      // Almost always a truncated response (max_tokens hit mid-JSON). Try to
      // salvage the complete elements rather than failing the whole run — a
      // 28-of-30-day calendar still beats an error.
      const salvaged = salvageJson(cleaned);
      if (salvaged) {
        captureError("api", new Error(`Tool AI JSON truncated, salvaged (${cleaned.length} chars, max_tokens ${maxTokens})`), { url: "tools:llm" });
        try {
          return { data: JSON.parse(salvaged) as T, tokens, brainContextSnapshotId };
        } catch { /* fall through to the hard error below */ }
      }
      captureError("api", new Error(`Tool AI returned unparseable JSON (likely truncated; ${cleaned.length} chars, max_tokens ${maxTokens})`), { url: "tools:llm" });
      return {
        data: null,
        tokens,
        error: "The AI response was cut off. Try again — or use a shorter input.",
        brainContextSnapshotId,
      };
    }
  } catch (err) {
    captureError("api", err, { url: "tools:llm" });
    return {
      data: null,
      tokens: 0,
      error: err instanceof Error ? err.message : "AI request failed.",
      brainContextSnapshotId,
    };
  }
}
