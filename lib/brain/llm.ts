/**
 * Chat-completions provider for the Next-side Brain AI (distillation, onboarding
 * draft). Prefers OpenRouter so the whole product can run on a single key, and
 * falls back to OpenAI — both speak the same OpenAI-compatible /chat/completions
 * shape.
 *
 * NOTE: embeddings (lib/brain/embed.ts) are OpenAI-only — OpenRouter has no
 * embeddings endpoint — and degrade gracefully when OPENAI_API_KEY is absent.
 */
export interface ChatProvider {
  url: string;
  key: string;
  provider: "openrouter" | "openai";
}

export function chatProvider(): ChatProvider | null {
  const or = process.env.OPENROUTER_API_KEY;
  if (or) return { url: "https://openrouter.ai/api/v1/chat/completions", key: or, provider: "openrouter" };
  const oa = process.env.OPENAI_API_KEY;
  if (oa) return { url: "https://api.openai.com/v1/chat/completions", key: oa, provider: "openai" };
  return null;
}

/** Resolve a model id for the active provider. OpenRouter namespaces OpenAI
 *  models as "openai/<model>", so a bare "gpt-4o-mini" is normalised there. */
export function chatModel(envVar: string, fallback = "gpt-4o-mini"): string {
  const m = process.env[envVar]?.trim() || fallback;
  if (chatProvider()?.provider === "openrouter" && !m.includes("/")) return `openai/${m}`;
  return m;
}
