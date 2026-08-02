/**
 * Daily task maintenance, driven by Vercel Cron (see vercel.json).
 *
 *   1. Spawn due recurring tasks — one card per due window (missed windows are
 *      collapsed, never bursted), then roll each recurrence to its next run.
 *   2. Archive stale "done" cards — completed longer ago than TASK_ARCHIVE_DAYS
 *      (default 30). Archived cards leave the board but still count as achieved.
 *   3. Purge old read notifications — read longer ago than
 *      NOTIFICATION_RETENTION_DAYS (default 60) so the table doesn't grow
 *      unbounded. Unread notifications are always kept.
 *
 * Auth: Vercel attaches `Authorization: Bearer <CRON_SECRET>` to cron requests
 * when CRON_SECRET is set. We reject anything else, so the endpoint is not a
 * public trigger.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";
import { nextRunAfter, type Frequency } from "@/lib/tasks/recurrence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ARCHIVE_DAYS = Number(process.env.TASK_ARCHIVE_DAYS ?? 30);
const NOTIFICATION_RETENTION_DAYS = Number(process.env.NOTIFICATION_RETENTION_DAYS ?? 60);

interface RecurrenceRow {
  id: string; client_id: string; created_by: string | null; assigned_to: string | null;
  category_id: string | null; title: string; description: string; priority: number;
  frequency: string; interval: number; next_run_on: string;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // ---- 1. Spawn due recurring tasks -------------------------------------
  let spawned = 0;
  const { data: dueRows } = await admin
    .from("task_recurrences")
    .select("id, client_id, created_by, assigned_to, category_id, title, description, priority, frequency, interval, next_run_on")
    .eq("active", true)
    .lte("next_run_on", today);

  for (const r of (dueRows ?? []) as RecurrenceRow[]) {
    const { data: card, error } = await admin
      .from("tasks")
      .insert({
        client_id: r.client_id,
        created_by: r.created_by,
        assigned_to: r.assigned_to,
        category_id: r.category_id,
        title: r.title,
        description: r.description,
        priority: r.priority,
        status: "todo",
        order_index: 0,
        updated_at: now.toISOString(),
      })
      .select("id")
      .single();

    if (error) { console.warn("[cron/tasks] spawn failed", r.id, error.message); continue; }
    spawned++;

    await admin
      .from("task_recurrences")
      .update({
        next_run_on: nextRunAfter(r.next_run_on, r.frequency as Frequency, r.interval, today),
        last_spawned_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", r.id);

    if (r.assigned_to) {
      void notify([r.assigned_to], {
        clientId: r.client_id,
        type: "task_assigned",
        title: `Recurring task: ${r.title.slice(0, 120)}`,
        href: `/tasks?card=${card.id}`,
      });
    }
  }

  // ---- 2. Archive stale done cards --------------------------------------
  const cutoff = new Date(now.getTime() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: archivedRows } = await admin
    .from("tasks")
    .update({ archived_at: now.toISOString() })
    .eq("status", "done")
    .is("archived_at", null)
    .lt("completed_at", cutoff)
    .select("id");

  const archived = (archivedRows ?? []).length;

  // ---- 3. Purge old read notifications ----------------------------------
  // Only ever delete notifications the user has already read — unread ones are
  // kept regardless of age so nothing is missed.
  const notifCutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: purgedRows } = await admin
    .from("notifications")
    .delete()
    .not("read_at", "is", null)
    .lt("read_at", notifCutoff)
    .select("id");

  const purgedNotifications = (purgedRows ?? []).length;

  // Heartbeat: /admin/health flags a cron that hasn't run on schedule.
  await admin.from("cron_heartbeats").upsert({
    name: "tasks",
    ran_at: now.toISOString(),
    detail: { spawned, archived, purgedNotifications },
  });

  return NextResponse.json({ ok: true, today, spawned, archived, purgedNotifications });
}
