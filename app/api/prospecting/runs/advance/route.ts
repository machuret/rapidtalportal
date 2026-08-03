import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceProspectingJob, ProspectingJobError } from "@/lib/prospecting/jobs";
import { leadProgressLimiter, tooManyRequests } from "@/lib/rate-limit";
import type { ProspectingJob } from "@/types/prospecting";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  jobIds: z.array(z.string().uuid()).min(1).max(8),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose valid active jobs." }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.clientId);
  if (denied) return denied;
  const limit = await leadProgressLimiter.check(`prospecting-progress:${user.id}`);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const db = createAdminClient();
  const uniqueJobIds = Array.from(new Set(parsed.data.jobIds));
  const settled = await Promise.allSettled(uniqueJobIds.map((jobId) => (
    advanceProspectingJob(db, jobId, parsed.data.clientId)
  )));
  const jobs: ProspectingJob[] = [];
  const errors: Array<{ jobId: string; message: string }> = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (result.value) jobs.push(result.value);
      return;
    }
    errors.push({
      jobId: uniqueJobIds[index]!,
      message: result.reason instanceof ProspectingJobError
        ? result.reason.message
        : "This job could not be refreshed yet.",
    });
  });
  return NextResponse.json({ jobs, errors, busy: uniqueJobIds.length - jobs.length });
});
