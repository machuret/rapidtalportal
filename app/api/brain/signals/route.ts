import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Brain signals — the learning input. Any AI surface posts a 👍 / 👎 (with an
 * optional reason) here; the Brain conditions future generations on them
 * (lib/brain/context.ts) and later distils them into curated memory.
 */
const createSchema = z.object({
  client_id:     z.string().uuid(),
  surface:       z.enum(["content_topic", "vault_answer", "compose", "tool", "content_draft", "kb"]),
  artifact_id:   z.string().uuid().optional().nullable(),
  artifact_text: z.string().min(1).max(8000),
  rating:        z.union([z.literal(1), z.literal(-1)]),
  reason:        z.string().max(2000).optional().nullable(),
  context:       z.record(z.string(), z.unknown()).optional().default({}),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("brain_signals")
    .insert({
      client_id:     parsed.data.client_id,
      user_id:       user.id,
      surface:       parsed.data.surface,
      artifact_id:   parsed.data.artifact_id ?? null,
      artifact_text: parsed.data.artifact_text,
      rating:        parsed.data.rating,
      reason:        parsed.data.reason ?? null,
      context:       parsed.data.context ?? {},
    })
    .select("id")
    .single();

  if (error) {
    console.error("[brain/signals POST]", error.code, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
});
