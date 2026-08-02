import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const ADVANCE_LIMIT = 4;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.from("crawl_jobs").select("id")
    .in("status", ["crawling", "ingesting", "synthesizing"])
    .order("updated_at", { ascending: true }).limit(ADVANCE_LIMIT);
  if (error) return NextResponse.json({ error: "Active Vault crawls could not be loaded." }, { status: 500 });

  const outcomes = await Promise.allSettled((data ?? []).map(async (job) => {
    const response = await fetch(new URL("/api/vault/crawl-site/advance", req.nextUrl.origin), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ jobId: job.id }),
      signal: AbortSignal.timeout(70_000),
    });
    if (!response.ok) throw new Error(`Vault crawl ${job.id} returned ${response.status}.`);
    return response.json() as Promise<{ job?: { status?: string } }>;
  }));
  const advanced = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
  const failures = outcomes.length - advanced;
  const terminal = outcomes.filter((outcome) =>
    outcome.status === "fulfilled" && ["done", "error"].includes(outcome.value.job?.status ?? "")
  ).length;

  await admin.from("cron_heartbeats").upsert({
    name: "vault-crawls",
    ran_at: new Date().toISOString(),
    detail: { scanned: outcomes.length, advanced, terminal, failures },
  });
  return NextResponse.json({ ok: failures === 0, scanned: outcomes.length, advanced, terminal, failures }, {
    status: failures ? 500 : 200,
  });
}
