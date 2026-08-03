import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProspectingJobError, requestProspectingCancellation } from "@/lib/prospecting/jobs";

const schema = z.object({ clientId: z.string().uuid(), jobId: z.string().uuid() });

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid collection job." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  try {
    const job = await requestProspectingCancellation(
      createAdminClient(),
      parsed.data.jobId,
      parsed.data.clientId,
      user.id,
    );
    return NextResponse.json({ job }, { status: 202 });
  } catch (caught) {
    const status = caught instanceof ProspectingJobError ? caught.status : 500;
    return NextResponse.json({
      error: caught instanceof ProspectingJobError ? caught.message : "Lead collection could not be cancelled.",
      retryable: caught instanceof ProspectingJobError && caught.retryable,
    }, { status });
  }
});
