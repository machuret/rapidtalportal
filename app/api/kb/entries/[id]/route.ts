import { NextResponse } from "next/server";
import { serverError } from "@/lib/api/errors";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({
  clientId: z.string().uuid(),
  question: z.string().min(5).optional(),
  answer: z.string().min(5).optional(),
  category: z.string().min(1).optional(),
});

const deleteSchema = z.object({ clientId: z.string().uuid() });

export const PATCH = withAuth<{ id: string }>(async (req, { user, params }) => {
  if (user.role === "va") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const accessError = assertClientAccess(user, parsed.data.clientId);
  if (accessError) return accessError;

  const { clientId, ...updates } = parsed.data;

  const admin = createAdminClient();
  // Mark as pinned so the next KB regeneration preserves this curated edit
  // instead of wiping it (see kb-generate's "delete only non-pinned" step).
  const { error } = await admin
    .from("kb_entries")
    .update({ ...updates, is_pinned: true })
    .eq("id", params.id)
    .eq("client_id", clientId);

  if (error) return serverError(error);

  return NextResponse.json({ success: true });
});

export const DELETE = withAuth<{ id: string }>(async (req, { user, params }) => {
  if (user.role === "va") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing clientId." }, { status: 400 });
  }

  const accessError = assertClientAccess(user, parsed.data.clientId);
  if (accessError) return accessError;

  const admin = createAdminClient();
  const { error } = await admin
    .from("kb_entries")
    .delete()
    .eq("id", params.id)
    .eq("client_id", parsed.data.clientId);

  if (error) return serverError(error);

  return NextResponse.json({ success: true });
});
