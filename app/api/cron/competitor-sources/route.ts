import { NextResponse, type NextRequest } from "next/server";
import {
  advanceCompetitorCrawl,
  startCompetitorRefresh,
  type IngestionSource,
} from "@/lib/competitors/ingestion";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const ADVANCE_LIMIT = 8;
const START_LIMIT = 4;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  // Migration 095 tables are accessed before the next generated-type refresh.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  let advanced = 0;
  let completed = 0;
  let started = 0;
  let failures = 0;

  const { data: activeJobs, error: jobsError } = await db
    .from("competitor_crawl_jobs")
    .select("id")
    .in("status", ["queued", "crawling", "ingesting"])
    .order("updated_at", { ascending: true })
    .limit(ADVANCE_LIMIT);
  if (jobsError) {
    return NextResponse.json({ error: "Couldn't read competitor collection jobs." }, { status: 500 });
  }

  for (const row of (activeJobs ?? []) as { id: string }[]) {
    try {
      const result = await advanceCompetitorCrawl(db, row.id);
      if (result) {
        advanced++;
        if (result.status === "done") completed++;
        if (result.status === "error") failures++;
      }
    } catch (error) {
      failures++;
      console.error("[cron/competitor-sources] advance", row.id, error);
    }
  }

  const { data: dueSources, error: dueError } = await db
    .from("competitor_sources")
    .select("*, competitors!inner(refresh_cadence, status, website_url)")
    .in("status", ["active", "retrying"])
    .eq("competitors.status", "active")
    .not("next_refresh_at", "is", null)
    .lte("next_refresh_at", new Date().toISOString())
    .order("next_refresh_at", { ascending: true })
    .limit(START_LIMIT);
  if (dueError) {
    failures++;
    console.error("[cron/competitor-sources] due sources", dueError);
  } else {
    for (const source of (dueSources ?? []) as IngestionSource[]) {
      try {
        await startCompetitorRefresh(db, {
          ...source,
          competitor_cadence: (source as IngestionSource & {
            competitors?: { refresh_cadence?: IngestionSource["refresh_cadence"] };
          }).competitors?.refresh_cadence ?? "manual",
          competitor_status: (source as IngestionSource & {
            competitors?: { status?: IngestionSource["competitor_status"] };
          }).competitors?.status ?? "active",
          competitor_website_url: (source as IngestionSource & {
            competitors?: { website_url?: string | null };
          }).competitors?.website_url ?? null,
        }, null);
        started++;
      } catch (error) {
        failures++;
        console.error("[cron/competitor-sources] start", source.id, error);
      }
    }
  }

  await db.from("cron_heartbeats").upsert({
    name: "competitor-sources",
    ran_at: new Date().toISOString(),
    detail: { advanced, completed, started, failures },
  });

  return NextResponse.json({
    ok: failures === 0,
    advanced,
    completed,
    started,
    failures,
  }, { status: failures > 0 ? 500 : 200 });
}
