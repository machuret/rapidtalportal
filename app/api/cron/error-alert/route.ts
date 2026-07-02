/**
 * Error-spike alerting, driven by Vercel Cron (see vercel.json, every 30 min).
 *
 * captureError() writes every server/client error to app_errors and /admin/errors
 * shows them — but nobody is TOLD when errors spike, so a broken deploy or a
 * failing integration degrades silently until someone happens to look. This cron
 * closes that gap: if more than ERROR_ALERT_THRESHOLD errors landed in the last
 * window, it emails every super_admin a summary.
 *
 * Spam control: the heartbeat row stores lastAlertAt; we never alert more than
 * once per ALERT_COOLDOWN_MS regardless of how long the spike lasts. The
 * heartbeat also feeds /admin/health's cron panel like every other cron.
 *
 * Auth: Vercel attaches `Authorization: Bearer <CRON_SECRET>`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigured, sendEmail, emailLayout, appUrl } from "@/lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const WINDOW_MS = 30 * 60_000; // matches the cron cadence
const ALERT_COOLDOWN_MS = 2 * 60 * 60_000; // at most one alert email per 2h
const DEFAULT_THRESHOLD = 5;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const threshold = Number(process.env.ERROR_ALERT_THRESHOLD) || DEFAULT_THRESHOLD;

  // Read the previous heartbeat first — it carries lastAlertAt for the cooldown.
  const { data: prevBeat } = await admin
    .from("cron_heartbeats")
    .select("detail")
    .eq("name", "error-alert")
    .maybeSingle();
  const lastAlertAt = Number((prevBeat?.detail as { lastAlertAt?: number } | null)?.lastAlertAt) || 0;

  const since = new Date(now - WINDOW_MS).toISOString();
  const { count, error: countErr } = await admin
    .from("app_errors")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (countErr) {
    return NextResponse.json({ error: "Couldn't count errors." }, { status: 500 });
  }

  const errors = count ?? 0;
  const inCooldown = now - lastAlertAt < ALERT_COOLDOWN_MS;
  let alerted = false;

  if (errors >= threshold && !inCooldown && emailConfigured()) {
    // A few most-recent messages so the email is actionable without opening the app.
    const { data: recent } = await admin
      .from("app_errors")
      .select("source, message, url")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5);
    const samples = ((recent ?? []) as { source: string; message: string; url: string | null }[])
      .map((r) => `[${r.source}] ${r.message.slice(0, 140)}${r.url ? ` (${r.url})` : ""}`);

    const { data: admins } = await admin
      .from("users")
      .select("email")
      .eq("role", "super_admin");
    const to = ((admins ?? []) as { email: string | null }[])
      .map((a) => a.email)
      .filter((e): e is string => !!e);

    if (to.length) {
      const res = await sendEmail({
        to,
        subject: `RapidTal: ${errors} errors in the last 30 minutes`,
        html: emailLayout({
          heading: "Error spike detected",
          paragraphs: [
            `${errors} error(s) were recorded in the last 30 minutes (alert threshold: ${threshold}).`,
            ...samples,
            "Full details, stacks, and affected users are on the admin errors page.",
          ],
          cta: { label: "Open /admin/errors", href: `${appUrl()}/admin/errors` },
          footer: "You receive this because you are a RapidTal super admin. At most one alert is sent per 2 hours.",
        }),
        text: `${errors} errors in the last 30 minutes. See ${appUrl()}/admin/errors`,
      });
      alerted = res.ok;
    }
  }

  await admin.from("cron_heartbeats").upsert({
    name: "error-alert",
    ran_at: new Date(now).toISOString(),
    detail: { errors, threshold, alerted, lastAlertAt: alerted ? now : lastAlertAt },
  });

  return NextResponse.json({ errors, threshold, alerted, cooldown: inCooldown });
}
