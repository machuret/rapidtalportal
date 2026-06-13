import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";

const schema = z.object({
  log_id:   z.string().uuid(),
  feedback: z.string().min(1).max(5000),
});

export const POST = withAuth(async (req, { user }) => {
  if (!["client_admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!user.client_id) return NextResponse.json({ error: "No client." }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input.", issues: parsed.error.flatten() }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("daily_logs")
    .update({
      admin_feedback: parsed.data.feedback,
      reviewed_at:    new Date().toISOString(),
      reviewed_by:    user.id,
    })
    .eq("id", parsed.data.log_id)
    .eq("client_id", user.client_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tell the VA their log got feedback — previously this landed silently.
  const log = data as { user_id: string; log_date: string };
  if (log.user_id !== user.id) {
    void notify([log.user_id], {
      clientId: user.client_id,
      type: "log_feedback",
      title: "New feedback on your daily log",
      body: parsed.data.feedback.slice(0, 200),
      href: "/daily-log",
    });
  }

  return NextResponse.json(data);
});
