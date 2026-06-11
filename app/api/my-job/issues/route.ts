/**
 * /api/my-job/issues — "Raise an issue" → routes to RapidTal (super_admin) for
 * mediation during the guarantee period, instead of letting problems fester.
 * GET  → the caller's own raised issues.
 * POST → raise a new issue; all super_admins are notified.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, { user }) => {
  const admin = createAdminClient();
  const { data } = await admin.from("va_issues").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  return NextResponse.json({ issues: data ?? [] });
});

const postSchema = z.object({
  category: z.enum(["pay", "hours", "workload", "conduct", "other"]).optional(),
  subject: z.string().min(3).max(200),
  detail: z.string().min(10).max(4000),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Add a subject and a bit of detail." }, { status: 422 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("va_issues")
    .insert({ user_id: user.id, client_id: user.client_id, ...parsed.data })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Route to RapidTal for mediation: notify every super_admin.
  const [{ data: supers }, { data: me }] = await Promise.all([
    admin.from("users").select("id").eq("role", "super_admin"),
    admin.from("users").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  const name = (me as { full_name: string | null } | null)?.full_name ?? "A VA";
  void notify(((supers ?? []) as { id: string }[]).map((s) => s.id), {
    clientId: user.client_id,
    type: "issue",
    title: `Issue raised: ${parsed.data.category ?? "other"}`,
    body: `${name}: ${parsed.data.subject}`,
    href: "/admin/errors",
  });
  return NextResponse.json({ issue: data });
});
