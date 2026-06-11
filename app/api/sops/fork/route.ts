/**
 * POST /api/sops/fork — copy a SOP into the caller's own client so they can
 * customize it (e.g. fork a generic Library SOP into the client's SOPs).
 * Admins only; the copy is owned by the caller's client.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAuth } from "@/lib/api/with-auth";

const schema = z.object({ sopId: z.string().uuid() });

export const POST = withAuth(
  async (req, { user }) => {
    if (!user.client_id) {
      return NextResponse.json({ error: "You need a client to copy a SOP into." }, { status: 400 });
    }

    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

    const admin = createAdminClient();
    const { data: src } = await admin
      .from("sops")
      .select("id, title, category, body, client_id, steps, intro, prerequisites, version")
      .eq("id", parsed.data.sopId)
      .maybeSingle();
    if (!src) return NextResponse.json({ error: "SOP not found." }, { status: 404 });

    const source = src as {
      id: string; title: string; category: string; body: string; client_id: string | null;
      steps: unknown; intro: string | null; prerequisites: string[] | null; version: number;
    };
    // Only the global library, or the caller's own client, may be forked.
    const readable = source.client_id === null || source.client_id === user.client_id || user.role === "super_admin";
    if (!readable) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("sops")
      .insert({
        client_id:  user.client_id,
        created_by: user.id,
        title:      source.title,
        category:   source.category || "General",
        body:       source.body,
        steps:      source.steps ?? null,
        intro:      source.intro ?? null,
        prerequisites: source.prerequisites ?? null,
        order_index: 0,
        // Remember the origin + its version at fork time, so drift is visible.
        forked_from: source.id,
        forked_version: source.version ?? 1,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data?.id }, { status: 201 });
  },
  { roles: ["client_admin", "super_admin"] },
);
