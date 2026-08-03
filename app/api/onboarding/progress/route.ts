import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { loadClientFirstSuccessProgress } from "@/lib/onboarding/server";

const querySchema = z.object({ clientId: z.string().uuid() });

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const parsed = querySchema.safeParse({
    clientId: new URL(req.url).searchParams.get("clientId"),
  });
  if (!parsed.success) return NextResponse.json({ error: "A valid client is required." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  try {
    return NextResponse.json(await loadClientFirstSuccessProgress(parsed.data.clientId));
  } catch (error) {
    console.error("[onboarding progress]", error);
    return NextResponse.json({
      error: "Starter progress is temporarily unavailable. Your work is safe.",
      retryable: true,
    }, { status: 503 });
  }
});
