import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { distillClientMemory } from "@/lib/brain/distill";

export const maxDuration = 60;

const bodySchema = z.object({ client_id: z.string().uuid() });

/** Admin-triggered "Distill now" — fold pending feedback into Brain Memory. */
export const POST = withAuth(async (req, { user }) => {
  if (user.role !== "client_admin" && user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  const result = await distillClientMemory(admin, parsed.data.client_id);
  return NextResponse.json(result);
});
