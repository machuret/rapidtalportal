import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { serverError } from "@/lib/api/errors";
import { withAuth } from "@/lib/api/with-auth";
import {
  listBrainOpportunities,
  runBrainDiagnostic,
} from "@/lib/brain/opportunities";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

const querySchema = z.object({
  clientId: z.string().uuid(),
});

const runSchema = z.object({
  clientId: z.string().uuid(),
});

export const GET = withAuth(async (req, { user }) => {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Brain opportunity request." }, { status: 422 });
  }
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  try {
    return NextResponse.json({
      opportunities: await listBrainOpportunities(
        createAdminClient(),
        parsed.data.clientId,
      ),
    });
  } catch (error) {
    return serverError(error);
  }
});

export const POST = withAuth(async (req, { user }) => {
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = runSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid clientId is required." }, { status: 422 });
  }
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;

  try {
    const result = await runBrainDiagnostic({
      admin: createAdminClient(),
      clientId: parsed.data.clientId,
      triggerKind: "manual",
      createdBy: user.id,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Brain diagnostic failed.";
    const conflict = /already running/iu.test(message);
    return NextResponse.json({
      error: message,
      code: conflict ? "brain_diagnostic_running" : "brain_diagnostic_failed",
      recoverable: true,
    }, { status: conflict ? 409 : 503 });
  }
}, { roles: ["client_admin", "super_admin"] });
