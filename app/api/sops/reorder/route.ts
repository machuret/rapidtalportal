/**
 * POST /api/sops/reorder — persist a new order_index for a set of SOPs (drag
 * reorder within a category). Authorised against the SOPs' shared scope:
 * global library → super_admin; a client's SOPs → that client's admin.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";

const schema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), order_index: z.number().int().min(0).max(100000) })).min(1).max(500),
});

export const POST = withAuth(
  async (req, { user }) => {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

    const ids = parsed.data.items.map((i) => i.id);
    const admin = createAdminClient();
    const { data: rows } = await admin.from("sops").select("id, client_id").in("id", ids);
    if (!rows || rows.length !== ids.length) return NextResponse.json({ error: "SOP not found." }, { status: 404 });

    // All items must share one scope (a single category list is one scope).
    const scopes = new Set((rows as { client_id: string | null }[]).map((r) => r.client_id ?? "__global__"));
    if (scopes.size !== 1) return NextResponse.json({ error: "Mixed scopes." }, { status: 400 });
    const scope = Array.from(scopes)[0];

    if (scope === "__global__") {
      if (user.role !== "super_admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });
    } else {
      if (!["client_admin", "super_admin"].includes(user.role)) return NextResponse.json({ error: "Admins only." }, { status: 403 });
      const denied = assertClientAccess(user, scope);
      if (denied) return denied;
    }

    for (const item of parsed.data.items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from("sops").update({ order_index: item.order_index }).eq("id", item.id);
    }
    return NextResponse.json({ success: true });
  },
  { roles: ["client_admin", "super_admin"] },
);
