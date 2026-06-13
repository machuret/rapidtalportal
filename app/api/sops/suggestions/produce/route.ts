/**
 * POST /api/sops/suggestions/produce — mass-produce full SOPs from selected
 * backlog ideas. For each chosen suggestion it generates a complete SOP (strong
 * model) and saves it (public by default), then marks the suggestion 'created'.
 * Admin-only, scope-aware. Capped per batch so it fits the function time budget.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sopAiLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeSopScope, generateSopDraft } from "@/lib/sops/ai";
import { serializeSteps } from "@/lib/sop-steps";

export const maxDuration = 60;

const MAX_BATCH = 8; // each is a strong-model generation — keep within 60s

const schema = z.object({
  clientId: z.string().uuid().nullable().optional(),
  ids: z.array(z.string().uuid()).min(1).max(MAX_BATCH),
});

interface SuggestionRow { id: string; title: string; category: string | null; client_id: string | null }

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: `Select between 1 and ${MAX_BATCH} ideas.` }, { status: 422 });

  const clientId = parsed.data.clientId ?? null;
  const denied = authorizeSopScope(user, clientId);
  if (denied) return denied;

  const rl = sopAiLimiter.check(`sop-ai:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const admin = createAdminClient();

  // Load the chosen suggestions, scoped — never trust ids alone.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (admin as any).from("sop_suggestions").select("id, title, category, client_id").in("id", parsed.data.ids).eq("status", "open");
  q = clientId === null ? q.is("client_id", null) : q.eq("client_id", clientId);
  const { data: rows } = await q;
  const suggestions = (rows ?? []) as SuggestionRow[];
  if (!suggestions.length) return NextResponse.json({ created: 0, failed: 0, ids: [] });

  // Generate + save each in parallel (batch is capped).
  const results = await Promise.all(suggestions.map(async (s) => {
    try {
      const { draft, error } = await generateSopDraft(clientId, { topic: s.title, title: s.title, category: s.category ?? undefined });
      if (!draft) return { id: s.id, ok: false, error };

      const body = serializeSteps(draft.intro, draft.prerequisites, draft.steps);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: created, error: insErr } = await (admin as any)
        .from("sops")
        .insert({
          client_id: clientId,
          created_by: user.id,
          title: draft.title,
          category: s.category?.trim() || "General",
          subcategory: null,
          body,
          order_index: 0,
          steps: draft.steps,
          intro: draft.intro,
          prerequisites: draft.prerequisites,
          visibility: "public",
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insErr) return { id: s.id, ok: false, error: insErr.message };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from("sop_suggestions").update({ status: "created" }).eq("id", s.id);
      return { id: s.id, ok: true, sopId: (created as { id: string }).id };
    } catch (e) {
      return { id: s.id, ok: false, error: e instanceof Error ? e.message : "failed" };
    }
  }));

  const created = results.filter((r) => r.ok).length;
  return NextResponse.json({
    created,
    failed: results.length - created,
    producedIds: results.filter((r) => r.ok).map((r) => r.id),
  });
}, { roles: ["client_admin", "super_admin"] });
