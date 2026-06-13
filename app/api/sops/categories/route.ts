/**
 * /api/sops/categories — manage SOP categories & subcategories as first-class
 * entities (table sop_categories), independent of whether any SOP uses them yet.
 *
 * GET    ?clientId= → managed category/subcategory names for the scope.
 * POST   { clientId?, kind, name }            → create.
 * PATCH  { clientId?, kind, from, to }        → rename/merge (updates the managed
 *        entry AND every SOP whose field matches).
 * DELETE { clientId?, kind, name }            → remove the managed entry (SOPs keep
 *        their text; it just stops appearing as a managed option).
 *
 * Scope is authorised: global = super_admin; client = that client's admins.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess, type ApiUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN = { roles: ["client_admin", "super_admin"] };

function authorizeScope(user: ApiUser, clientId: string | null): NextResponse | null {
  if (clientId === null) {
    if (user.role !== "super_admin") return NextResponse.json({ error: "Global library is super-admin only." }, { status: 403 });
    return null;
  }
  if (!["client_admin", "super_admin"].includes(user.role)) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  return assertClientAccess(user, clientId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoped(q: any, clientId: string | null) {
  return clientId === null ? q.is("client_id", null) : q.eq("client_id", clientId);
}

export const GET = withAuth(async (req, { user }) => {
  const raw = req.nextUrl.searchParams.get("clientId");
  const clientId = raw && raw !== "null" ? raw : null;
  const denied = authorizeScope(user, clientId);
  if (denied) return denied;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await scoped((admin as any).from("sop_categories").select("kind, name"), clientId);
  return NextResponse.json({ managed: (data ?? []) as { kind: string; name: string }[] });
}, ADMIN);

const createSchema = z.object({
  clientId: z.string().uuid().nullable().optional(),
  kind:     z.enum(["category", "subcategory"]),
  name:     z.string().min(1).max(100),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a name." }, { status: 422 });
  const clientId = parsed.data.clientId ?? null;
  const denied = authorizeScope(user, clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("sop_categories").insert({ client_id: clientId, kind: parsed.data.kind, name: parsed.data.name.trim() });
  // Unique violation = already exists — treat as success (idempotent create).
  if (error && error.code !== "23505") return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}, ADMIN);

const renameSchema = z.object({
  clientId: z.string().uuid().nullable().optional(),
  kind:     z.enum(["category", "subcategory"]),
  from:     z.string().min(1).max(100),
  to:       z.string().max(100),
});

export const PATCH = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });
  const clientId = parsed.data.clientId ?? null;
  const denied = authorizeScope(user, clientId);
  if (denied) return denied;

  const from = parsed.data.from.trim();
  const isCategory = parsed.data.kind === "category";
  const toSop = isCategory ? (parsed.data.to.trim() || "General") : (parsed.data.to.trim() || null);
  const toName = parsed.data.to.trim();
  if (!toName || toName === from) return NextResponse.json({ updated: 0 });

  const admin = createAdminClient();
  // Update SOPs whose field matches.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await scoped((admin as any).from("sops").update({ [parsed.data.kind]: toSop, updated_at: new Date().toISOString() }).eq(parsed.data.kind, from), clientId).select("id", { count: "exact" });
  // Update the managed entry: drop the old name, add the new (ignore dup = merge).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await scoped((admin as any).from("sop_categories").delete().eq("kind", parsed.data.kind).eq("name", from), clientId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from("sop_categories").insert({ client_id: clientId, kind: parsed.data.kind, name: toName });
  return NextResponse.json({ updated: count ?? 0 });
}, ADMIN);

const deleteSchema = z.object({
  clientId: z.string().uuid().nullable().optional(),
  kind:     z.enum(["category", "subcategory"]),
  name:     z.string().min(1).max(100),
});

export const DELETE = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });
  const clientId = parsed.data.clientId ?? null;
  const denied = authorizeScope(user, clientId);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await scoped((admin as any).from("sop_categories").delete().eq("kind", parsed.data.kind).eq("name", parsed.data.name.trim()), clientId);
  return NextResponse.json({ ok: true });
}, ADMIN);
