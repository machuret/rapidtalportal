import { NextResponse, type NextRequest } from "next/server";
import { runBrainDiagnostic } from "@/lib/brain/opportunities";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_CLIENTS_PER_RUN = 10;
const DIAGNOSTIC_INTERVAL_MS = 7 * 86_400_000;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - DIAGNOSTIC_INTERVAL_MS).toISOString();
  const [{ data: clients, error: clientsError }, { data: recent, error: recentError }] = await Promise.all([
    admin.from("clients")
      .select("id")
      .is("archived_at", null)
      .order("id", { ascending: true })
      .limit(500),
    admin.from("brain_diagnostic_runs")
      .select("client_id")
      .eq("status", "completed")
      .gte("completed_at", cutoff)
      .limit(5000),
  ]);
  if (clientsError || recentError) {
    return NextResponse.json({
      error: "Scheduled Brain diagnostics could not load their queue.",
      recoverable: true,
    }, { status: 503 });
  }

  const recentlyChecked = new Set(
    ((recent ?? []) as Array<{ client_id: string }>).map((row) => row.client_id),
  );
  const queue = ((clients ?? []) as Array<{ id: string }>)
    .map((client) => client.id)
    .filter((clientId) => !recentlyChecked.has(clientId))
    .slice(0, MAX_CLIENTS_PER_RUN);

  let completed = 0;
  let failed = 0;
  let created = 0;
  let notified = 0;
  for (const clientId of queue) {
    try {
      const result = await runBrainDiagnostic({
        admin,
        clientId,
        triggerKind: "scheduled",
      });
      completed++;
      created += result.created;
      // Fan-out: opportunities are pull-only on /brain unless someone is told.
      if (result.created > 0) {
        const { data: adminsOfClient } = await admin
          .from("users").select("id")
          .eq("client_id", clientId).eq("role", "client_admin");
        const recipientIds = ((adminsOfClient ?? []) as Array<{ id: string }>).map((row) => row.id);
        if (recipientIds.length) {
          const top = result.createdTitles.slice(0, 2).join(" · ");
          await notify(recipientIds, {
            clientId,
            type: "brain_opportunity",
            title: `Your Brain found ${result.created} new opportunit${result.created === 1 ? "y" : "ies"}`,
            body: top.length > 220 ? `${top.slice(0, 220)}…` : top,
            href: "/brain",
          });
          notified += recipientIds.length;
        }
      }
    } catch (error) {
      failed++;
      console.error("[cron/brain-opportunities] client", clientId, error);
    }
  }

  await admin.from("cron_heartbeats").upsert({
    name: "brain-opportunities",
    ran_at: new Date().toISOString(),
    detail: { queued: queue.length, completed, failed, created, notified },
  });

  return NextResponse.json({
    ok: failed === 0,
    queued: queue.length,
    completed,
    failed,
    opportunitiesCreated: created,
  }, { status: failed > 0 ? 503 : 200 });
}
