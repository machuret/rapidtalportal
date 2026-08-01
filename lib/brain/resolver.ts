import type { SupabaseClient } from "@supabase/supabase-js";
import {
  persistBrainContextSnapshot,
  renderBrainContext,
  resolveBrainContext,
  type BrainContextRequest,
  type BrainContextV1,
} from "@/supabase/functions/_shared/brain-context";
import {
  brainContextSchema,
  type BrainContext,
} from "@/lib/brain/context-contract";
import { embedTexts } from "@/lib/brain/embed";

type Admin = SupabaseClient;

export interface ResolvedNodeBrainContext {
  context: BrainContext;
  prompt: string;
}

/**
 * Vault/Library retrieval needs gte-small (384-dim) embeddings, which only the
 * Deno edge runtime can produce (`Supabase.ai.Session`). The tiny `brain-embed`
 * edge function proxies that model, so Node surfaces get true semantic
 * retrieval too. Returns undefined when the env is missing (local dev) — the
 * shared resolver then degrades to lexical Vault matching with a visible
 * warning.
 */
function buildEdgeEmbed(): ((query: string) => Promise<number[]>) | undefined {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return undefined;
  return async (query) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/brain-embed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`brain-embed failed with HTTP ${response.status}.`);
      }
      const body = (await response.json()) as { embedding?: number[] };
      if (!Array.isArray(body.embedding) || body.embedding.length === 0) {
        throw new Error("brain-embed returned no embedding.");
      }
      return body.embedding;
    } finally {
      clearTimeout(timeout);
    }
  };
}

/**
 * Node/server resolver wrapper. The shared resolver is deliberately free of
 * Next.js and Deno dependencies; this wrapper adds strict contract validation
 * before a context is ever supplied to a model or persisted.
 */
export async function resolveNodeBrainContext(args: {
  admin: Admin;
  clientId: string;
  request: BrainContextRequest;
  model?: string | null;
  promptVersion?: string | null;
  maxKnowledge?: number;
  maxLibrary?: number;
  maxMemory?: number;
}): Promise<ResolvedNodeBrainContext> {
  const raw = await resolveBrainContext({
    ...args,
    // Vault/Library retrieval is semantic: gte-small (384-dim) embeddings come
    // from the brain-embed edge function (the Deno-only `Supabase.ai.Session`
    // API is unavailable in Node). If the proxy is unreachable the shared
    // resolver degrades to lexical Vault matching with a visible warning.
    // Memory stays OpenAI-vectored (text-embedding-3-small, 1536-dim), matching
    // the brain_memory embedding space.
    embed: buildEdgeEmbed(),
    memoryEmbed: async (query) => {
      const vectors = await embedTexts([query]);
      if (!vectors?.[0]) throw new Error("Brain memory embedding unavailable.");
      return vectors[0];
    },
  });
  const context = brainContextSchema.parse(raw);
  return { context, prompt: renderBrainContext(context as BrainContextV1) };
}

export async function persistNodeBrainContextSnapshot(args: {
  admin: Admin;
  context: BrainContext;
  artifactKind?: string | null;
  artifactId?: string | null;
  createdBy?: string | null;
}): Promise<{ id: string; snapshotHash: string }> {
  return persistBrainContextSnapshot({
    ...args,
    context: args.context as BrainContextV1,
  });
}
