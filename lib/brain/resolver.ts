import type { SupabaseClient } from "@supabase/supabase-js";
import {
  brainContextSurfaceEnabled,
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
  maxMemory?: number;
}): Promise<ResolvedNodeBrainContext> {
  const raw = await resolveBrainContext({
    ...args,
    // The Vault embeddings use gte-small (384 dimensions) in Supabase Edge.
    // Node's existing OpenAI embeddings have a different vector space, so the
    // Node resolver intentionally uses deterministic lexical Vault retrieval;
    // memory uses OpenAI vectors because the same provider is available in Edge.
    memoryEmbed: async (query) => {
      const vectors = await embedTexts([query]);
      if (!vectors?.[0]) throw new Error("Brain memory embedding unavailable.");
      return vectors[0];
    },
  });
  const context = brainContextSchema.parse(raw);
  return { context, prompt: renderBrainContext(context as BrainContextV1) };
}

export async function nodeBrainContextEnabled(
  admin: Admin,
  clientId: string,
  surface: "ask" | "content" | "topics" | "tools",
): Promise<boolean> {
  return brainContextSurfaceEnabled(admin, clientId, surface);
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
