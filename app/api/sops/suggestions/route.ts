/**
 * /api/sops/suggestions — a persistent backlog of SOP ideas (admin-only).
 *
 * GET    ?clientId=  → open suggestions for the scope (global if omitted).
 * POST   { clientId?, category?, topic?, count? } → mass-generate NEW ideas,
 *        excluding existing SOP titles AND every prior suggestion (so nothing is
 *        suggested twice). Persists them as 'open' and returns the open list.
 * PATCH  { id, status: 'dismissed' | 'created' } → update one (never re-suggested).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sopAiLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeSopScope, clientContext, llmJson, SUGGEST_MODEL } from "@/lib/sops/ai";

const ADMIN = { roles: ["client_admin", "super_admin"] };

interface SuggestionRow { id: string; title: string; scope: string | null; category: string | null; step_count: number | null; status: string; created_at: string }
interface GenItem { title: string; scope: string; stepCount: number }

// Scope a query to global (null) or a client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoped(q: any, clientId: string | null) {
  return clientId === null ? q.is("client_id", null) : q.eq("client_id", clientId);
}

// ── GET: open suggestions ─────────────────────────────────────────────────────
export const GET = withAuth(async (req, { user }) => {
  const clientIdRaw = req.nextUrl.searchParams.get("clientId");
  const clientId = clientIdRaw && clientIdRaw !== "null" ? clientIdRaw : null;
  const denied = authorizeSopScope(user, clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await scoped((admin as any).from("sop_suggestions").select("id, title, scope, category, step_count, status, created_at"), clientId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  return NextResponse.json({ suggestions: (data ?? []) as SuggestionRow[] });
}, ADMIN);

const generateSchema = z.object({
  clientId: z.string().uuid().nullable().optional(),
  category: z.string().max(100).optional(),
  topic:    z.string().max(300).optional(),
  count:    z.number().int().min(3).max(25).optional().default(15),
});

// ── POST: mass-generate ───────────────────────────────────────────────────────
export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const clientId = parsed.data.clientId ?? null;
  const denied = authorizeSopScope(user, clientId);
  if (denied) return denied;

  const rl = sopAiLimiter.check(`sop-ai:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const admin = createAdminClient();

  // Everything we already have/considered, so we never suggest it again.
  const [{ data: sopRows }, { data: sugRows }] = await Promise.all([
    scoped(admin.from("sops").select("title").is("deleted_at", null), clientId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scoped((admin as any).from("sop_suggestions").select("title"), clientId),
  ]);
  const existingTitles = [
    ...((sopRows ?? []) as { title: string }[]).map((r) => r.title),
    ...((sugRows ?? []) as { title: string }[]).map((r) => r.title),
  ];
  const existingSet = new Set(existingTitles.map((t) => t.trim().toLowerCase()));

  const ctx = await clientContext(clientId);
  const system = `You generate fresh ideas for a company's SOP (standard operating procedure) library. Return JSON exactly as {"suggestions":[{"title":"...","scope":"one sentence on what it covers","stepCount":<int>}]}.
Rules:
- Generate ${parsed.data.count} DISTINCT, specific, non-overlapping SOP ideas a virtual assistant could follow.
- Each title is concrete and actionable (e.g. "Migrate a WordPress site to a new host"), not a vague theme.
- Do NOT repeat or lightly reword anything in the EXISTING list — propose genuinely new procedures.
- Prefer practical, high-frequency tasks for this business.
${ctx ? `\nCompany context:\n${ctx}` : ""}`;

  const userMsg = [
    parsed.data.category ? `Category focus: ${parsed.data.category}` : "Any useful category.",
    parsed.data.topic ? `Topic/area: ${parsed.data.topic}` : "",
    existingTitles.length ? `EXISTING (do NOT suggest these or close variants):\n${existingTitles.slice(0, 200).map((t) => `- ${t}`).join("\n")}` : "Nothing exists yet.",
  ].filter(Boolean).join("\n\n");

  const result = await llmJson<{ suggestions: GenItem[] }>(SUGGEST_MODEL, system, userMsg, 2000);
  if (!result.data?.suggestions?.length) {
    return NextResponse.json({ error: result.error ?? "Couldn't generate ideas. Try again." }, { status: 502 });
  }

  // Keep only genuinely-new titles, de-duped within the batch.
  const seen = new Set<string>();
  const fresh = result.data.suggestions
    .filter((s) => s.title?.trim())
    .map((s) => ({ title: String(s.title).trim().slice(0, 200), scope: String(s.scope ?? "").slice(0, 300), stepCount: Math.min(40, Math.max(1, Number(s.stepCount) || 6)) }))
    .filter((s) => {
      const key = s.title.toLowerCase();
      if (existingSet.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (fresh.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("sop_suggestions").insert(fresh.map((s) => ({
      client_id: clientId,
      title: s.title,
      scope: s.scope || null,
      category: parsed.data.category?.trim() || null,
      step_count: s.stepCount,
      status: "open",
      created_by: user.id,
    })));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await scoped((admin as any).from("sop_suggestions").select("id, title, scope, category, step_count, status, created_at"), clientId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  return NextResponse.json({ added: fresh.length, suggestions: (data ?? []) as SuggestionRow[] });
}, ADMIN);

const patchSchema = z.object({
  id: z.string().uuid().optional(),
  ids: z.array(z.string().uuid()).max(500).optional(),
  status: z.enum(["dismissed", "created"]),
}).refine((d) => d.id || (d.ids?.length ?? 0) > 0, "Provide id or ids.");

// ── PATCH: dismiss / mark created (one or many) ───────────────────────────────
export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

  const targetIds = parsed.data.ids?.length ? parsed.data.ids : [parsed.data.id!];

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin as any).from("sop_suggestions").select("id, client_id").in("id", targetIds);
  const rows = (existing ?? []) as { id: string; client_id: string | null }[];
  if (!rows.length) return NextResponse.json({ updated: 0 });

  // Authorise every distinct scope touched.
  for (const clientId of Array.from(new Set(rows.map((r) => r.client_id)))) {
    const denied = authorizeSopScope(user, clientId);
    if (denied) return denied;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("sop_suggestions").update({ status: parsed.data.status }).in("id", rows.map((r) => r.id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: rows.length });
}, ADMIN);
