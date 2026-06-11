/**
 * Server-side prompt resolution: admin override (ai_prompts) ?? code default,
 * with [[variable]] rendering. A short in-memory TTL cache keeps this to ~zero
 * DB cost per AI call while letting admin edits go live within ~30s on every
 * serverless instance (instantly on the one that saved).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getPromptDef } from "./registry";

const TTL_MS = 30_000;
const cache = new Map<string, { override: string | null; at: number }>();

/** The active template for a slug: admin override if set, else the code default. */
export async function getPromptTemplate(slug: string): Promise<string> {
  const def = getPromptDef(slug);
  if (!def) throw new Error(`Unknown prompt slug: ${slug}`);

  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.override ?? def.template;

  let override: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("ai_prompts").select("content").eq("slug", slug).maybeSingle();
    override = (data as { content: string } | null)?.content ?? null;
  } catch {
    override = null; // never let prompt lookup take a feature down
  }
  cache.set(slug, { override, at: Date.now() });
  return override ?? def.template;
}

/** Fill [[name]] placeholders; unknown/missing variables render as "". */
export function renderTemplate(template: string, vars: Record<string, string> = {}): string {
  return template.replace(/\[\[(\w+)\]\]/g, (_, name: string) => vars[name] ?? "");
}

/** One-call helper: resolve the active template and render it. */
export async function renderPrompt(slug: string, vars: Record<string, string> = {}): Promise<string> {
  return renderTemplate(await getPromptTemplate(slug), vars);
}

/** Called by the admin prompts API after a save/reset. */
export function bustPromptCache(slug?: string): void {
  if (slug) cache.delete(slug);
  else cache.clear();
}
