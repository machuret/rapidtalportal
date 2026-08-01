import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatProvider, chatModel } from "@/lib/brain/llm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ClaimedCheckIn = {
  id: string;
  check_in_claim_token: string | null;
  owner_id: string;
  commitment: string;
  status: string;
  due_date: string | null;
  reminder_count: number;
  goal_id: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated schema follows migration 139
async function recordHeartbeat(admin: any, detail: Record<string, unknown>) {
  const result = await admin.from("cron_heartbeats").upsert({
    name: "coach-check-ins", ran_at: new Date().toISOString(), detail,
  });
  if (result.error) console.error("coach-check-ins: heartbeat failed", result.error);
  return !result.error;
}

// Compose a short, contextual follow-up for a claimed check-in. Returns null
// when the model is unavailable, fails, or answers empty — the caller then
// delivers with p_message NULL and the notification falls back to the
// commitment text. Only the commitment owner's own data enters the prompt.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated schema follows migration 139
async function composeCheckInMessage(admin: any, item: ClaimedCheckIn): Promise<string | null> {
  const llm = chatProvider();
  if (!llm) return null;
  try {
    let goalLine = "";
    if (item.goal_id) {
      const goal = await admin.from("coach_goals").select("title, progress, status")
        .eq("id", item.goal_id).eq("owner_id", item.owner_id).maybeSingle();
      if (!goal.error && goal.data) {
        goalLine = `Linked goal: "${goal.data.title}" (${goal.data.progress}% complete, ${goal.data.status}).\n`;
      }
    }
    const events = await admin.from("coach_progress_events").select("event_type, created_at")
      .eq("owner_id", item.owner_id).order("created_at", { ascending: false }).limit(5);
    const eventLines = events.error ? [] : (events.data ?? []).map(
      (e: { event_type: string; created_at: string }) =>
        `- ${e.event_type.replace(/_/g, " ")} (${String(e.created_at).slice(0, 10)})`,
    );
    const today = new Date().toISOString().slice(0, 10);
    const userPrompt =
      `Write a brief, warm check-in follow-up (1-3 sentences) to the owner of this commitment.\n\n` +
      `Commitment: "${item.commitment}"\n` +
      `Status: ${item.status}\n` +
      `Due date: ${item.due_date ?? "none"} (today: ${today})\n` +
      `Reminders already sent: ${item.reminder_count}\n` +
      goalLine +
      (eventLines.length ? `Recent progress:\n${eventLines.join("\n")}\n` : "") +
      `\nRules: 1-3 sentences, plain text, no greeting or sign-off. Warm and specific, ` +
      `no guilt-tripping; if the due date has passed, acknowledge it without scolding. ` +
      `Address the owner directly ("you").`;
    const res = await fetch(llm.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.key}` },
      body: JSON.stringify({
        model: chatModel("COACH_CHECKIN_MODEL"), temperature: 0.4, max_tokens: 120,
        messages: [
          { role: "system", content: "You are a warm, concise accountability coach. You write short check-in follow-ups; you never scold." },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      console.error("coach-check-ins: message generation failed", llm.provider, res.status);
      return null;
    }
    const content = (await res.json()).choices?.[0]?.message?.content;
    const message = typeof content === "string" ? content.trim() : "";
    return message || null;
  } catch (e) {
    console.error("coach-check-ins: message generation failed", e);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration 138 precedes generated schema refresh
  const admin = createAdminClient() as any;
  const claimed = await admin.rpc("claim_due_coach_check_ins", { p_limit: 100 });
  if (claimed.error) {
    await recordHeartbeat(admin, { claimed: 0, delivered: 0, failed: 1, stage: "claim" });
    return NextResponse.json({ error: "Coach check-ins could not be claimed.", recoverable: true }, { status: 503 });
  }
  let delivered = 0;
  let failed = 0;
  let releaseFailed = 0;
  for (const item of (claimed.data ?? []) as ClaimedCheckIn[]) {
    if (!item.check_in_claim_token) continue;
    const message = await composeCheckInMessage(admin, item);
    const result = await admin.rpc("deliver_coach_check_in", {
      p_commitment_id: item.id, p_claim_token: item.check_in_claim_token, p_message: message,
    });
    if (result.error || result.data !== true) {
      failed++;
      const released = await admin.rpc("complete_coach_check_in", {
        p_commitment_id: item.id, p_claim_token: item.check_in_claim_token, p_delivered: false,
      });
      if (released.error || released.data !== true) {
        releaseFailed++;
        console.error("coach-check-ins: failed lease could not be released", { commitmentId: item.id, error: released.error });
      }
    } else delivered++;
  }
  const heartbeatRecorded = await recordHeartbeat(admin, {
    claimed: (claimed.data ?? []).length, delivered, failed, releaseFailed,
    stage: failed ? "delivery" : "complete",
  });
  const ok = failed === 0 && heartbeatRecorded;
  return NextResponse.json({ ok, claimed: (claimed.data ?? []).length, delivered, failed, releaseFailed, heartbeatRecorded }, { status: ok ? 200 : 503 });
}
