import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import {
  advanceCompetitorCrawl,
  CompetitorIngestionError,
} from "@/lib/competitors/ingestion";
import { createAdminClient } from "@/lib/supabase/admin";
import { rolesWithContentCapability } from "@/lib/auth/content-capabilities";

export const maxDuration = 60;

const schema = z.object({
  client_id: z.string().uuid(),
  job_id: z.string().uuid(),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  const admin = createAdminClient();
  // Migration 095 tables are accessed before the next generated-type refresh.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error } = await (admin as any)
    .from("competitor_crawl_jobs")
    .select("id")
    .eq("id", parsed.data.job_id)
    .eq("client_id", parsed.data.client_id)
    .maybeSingle();
  if (error || !existing) return NextResponse.json({ error: "Collection job not found." }, { status: 404 });

  try {
    const job = await advanceCompetitorCrawl(admin, parsed.data.job_id, parsed.data.client_id);
    return NextResponse.json({ job, busy: !job });
  } catch (caught) {
    const status = caught instanceof CompetitorIngestionError ? caught.status : 500;
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Couldn't advance source collection." },
      { status },
    );
  }
}, { roles: rolesWithContentCapability("collect_competitor_content") });
