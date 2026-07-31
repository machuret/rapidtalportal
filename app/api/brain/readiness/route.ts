import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import { computeBrainReadiness } from "@/lib/brain/readiness";
import { createAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({
  clientId: z.string().uuid(),
  channel: z.enum([
    "linkedin", "facebook", "instagram", "x", "email",
    "blog", "newsletter", "message", "other",
  ]).optional(),
});

export const GET = withAuth(async (req, { user }) => {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid readiness request." }, { status: 422 });
  }
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  try {
    const readiness = await computeBrainReadiness(
      createAdminClient(),
      parsed.data.clientId,
      { channel: parsed.data.channel },
    );
    return NextResponse.json(readiness);
  } catch (error) {
    return serverError(error);
  }
});
