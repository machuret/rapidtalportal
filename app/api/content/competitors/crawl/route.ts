import { NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/api-auth";
import { withAuth } from "@/lib/api/with-auth";
import {
  CompetitorIngestionError,
  startCompetitorRefresh,
  type IngestionSource,
} from "@/lib/competitors/ingestion";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteCrawlLimiter, tooManyRequests } from "@/lib/rate-limit";

const schema = z.object({
  client_id: z.string().uuid(),
  source_id: z.string().uuid(),
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

  const limit = siteCrawlLimiter.check(`competitor-crawl:${user.id}`);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const admin = createAdminClient();
  // Migration 095 tables are accessed before the next generated-type refresh.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("competitor_sources")
    .select("*, competitors!inner(refresh_cadence)")
    .eq("id", parsed.data.source_id)
    .eq("client_id", parsed.data.client_id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Source not found." }, { status: 404 });

  try {
    const job = await startCompetitorRefresh(admin, {
      ...data,
      competitor_cadence: data.competitors?.refresh_cadence ?? "manual",
    } as IngestionSource, user.id);
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    const status = error instanceof CompetitorIngestionError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't refresh this source." },
      { status },
    );
  }
}, { roles: ["client_admin", "super_admin"] });
