/**
 * POST /api/vault/promote-kb — promote a good Ask the Brain answer into the
 * curated Knowledge Base, so it's reused and trusted. Pinned so KB regeneration
 * won't wipe it. Admins only (curation).
 */
import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";

const schema = z.object({
  clientId: z.string().uuid(),
  question: z.string().min(3).max(2000),
  answer: z.string().min(1).max(20000),
  category: z.string().max(100).optional(),
});

export const POST = withAuth(
  async (req, { user }) => {
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 422 });

    const access = assertClientAccess(user, parsed.data.clientId);
    if (access) return access;

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("kb_entries")
      .insert({
        client_id: parsed.data.clientId,
        question: parsed.data.question.trim(),
        answer: parsed.data.answer.trim(),
        category: parsed.data.category ?? "General",
        is_pinned: true, // curated by a human — don't let regeneration wipe it
      })
      .select("id")
      .single();

    if (error) {
      console.error("[vault/promote-kb]", error.message);
      return serverError(error);
    }
    return NextResponse.json({ success: true, id: data?.id });
  },
  { roles: ["client_admin", "super_admin"] },
);
