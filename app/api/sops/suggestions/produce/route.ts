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
import { serializeSteps } from "@/lib/sops/steps";

export const maxDuration = 60;

const MAX_BATCH = 8; // each is a strong-model generation — keep within 60s

const schema = z.object({
  clientId: z.string().uuid().nullable().optional(),
  // Either backlog suggestion ids…
  ids: z.array(z.string().uuid()).max(MAX_BATCH).optional(),
  // …or ad-hoc angles (e.g. the studio "suggest angles" picks).
  items: z.array(z.object({
    title: z.string().min(1).max(300),
    category: z.string().max(100).optional(),
    subcategory: z.string().max(100).optional(),
  })).max(MAX_BATCH).optional(),
}).refine((d) => (d.ids?.length ?? 0) > 0 || (d.items?.length ?? 0) > 0, "Provide ids or items.");

interface SuggestionRow { id: string; title: string; category: string | null; client_id: string | null }
interface Target { title: string; category: string | null; subcategory: string | null; suggestionId?: string }

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: `Select between 1 and ${MAX_BATCH} items.` }, { status: 422 });

  const clientId = parsed.data.clientId ?? null;
  const denied = authorizeSopScope(user, clientId);
  if (denied) return denied;

  const rl = await sopAiLimiter.check(`sop-ai:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const admin = createAdminClient();

  // Resolve the list of SOPs to write.
  const targets: Target[] = [];
  if (parsed.data.ids?.length) {
    // Load the chosen backlog suggestions, scoped — never trust ids alone.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (admin as any).from("sop_suggestions").select("id, title, category, client_id").in("id", parsed.data.ids).eq("status", "open");
    q = clientId === null ? q.is("client_id", null) : q.eq("client_id", clientId);
    const { data: rows } = await q;
    for (const s of (rows ?? []) as SuggestionRow[]) targets.push({ title: s.title, category: s.category, subcategory: null, suggestionId: s.id });
  }
  for (const it of (parsed.data.items ?? [])) {
    targets.push({ title: it.title.trim(), category: it.category?.trim() || null, subcategory: it.subcategory?.trim() || null });
  }
  if (!targets.length) return NextResponse.json({ created: 0, failed: 0, producedIds: [] });

  // Generate + save each in parallel (batch is capped).
  const results = await Promise.all(targets.map(async (t) => {
    try {
      const { draft, error } = await generateSopDraft(clientId, { topic: t.title, title: t.title, category: t.category ?? undefined });
      if (!draft) return { id: t.suggestionId, ok: false, error };

      const body = serializeSteps(draft.intro, draft.prerequisites, draft.steps);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await (admin as any)
        .from("sops")
        .insert({
          client_id: clientId,
          created_by: user.id,
          title: draft.title,
          category: t.category?.trim() || "General",
          subcategory: t.subcategory,
          body,
          order_index: 0,
          steps: draft.steps,
          intro: draft.intro,
          prerequisites: draft.prerequisites,
          visibility: "public",
          updated_at: new Date().toISOString(),
        });
      if (insErr) return { id: t.suggestionId, ok: false, error: insErr.message };

      if (t.suggestionId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from("sop_suggestions").update({ status: "created" }).eq("id", t.suggestionId);
      }
      return { id: t.suggestionId, ok: true };
    } catch (e) {
      return { id: t.suggestionId, ok: false, error: e instanceof Error ? e.message : "failed" };
    }
  }));

  const created = results.filter((r) => r.ok).length;
  return NextResponse.json({
    created,
    failed: results.length - created,
    producedIds: results.filter((r) => r.ok && r.id).map((r) => r.id),
  });
}, { roles: ["client_admin", "super_admin"] });
