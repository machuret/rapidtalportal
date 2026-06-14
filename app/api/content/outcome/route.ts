/**
 * POST /api/content/outcome — record a real-world verdict on a published/approved
 * piece ('win' or 'miss'). This is the strongest learning signal the Brain gets:
 * not "did an admin approve it?" but "did it actually land?". Feeds brain_signals
 * (surface 'content_outcome') so distillation, the Brain Score and the journal
 * all pick it up. Admins only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { assertClientAccess } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logBrainEvent } from "@/lib/brain/events";

const schema = z.object({
  client_id: z.string().uuid(),
  id: z.string().uuid(),
  outcome: z.enum(["win", "miss"]),
});

export const POST = withAuth(async (req, { user }) => {
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const denied = assertClientAccess(user, parsed.data.client_id);
  if (denied) return denied;

  if (user.role !== "client_admin" && user.role !== "super_admin") {
    return NextResponse.json({ error: "Only admins can record outcomes." }, { status: 403 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("content_pieces")
    .update({ outcome: parsed.data.outcome, outcome_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id)
    .select("id, content_type, body")
    .single();

  if (error) {
    console.error("[content/outcome]", error.code, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const win = parsed.data.outcome === "win";
  const body = (data.body ?? "").trim();
  // Only feed the learning loop when there's content to learn from; the outcome
  // verdict is still recorded on the piece above regardless.
  if (body) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from("brain_signals").insert({
        client_id: parsed.data.client_id,
        user_id: user.id,
        surface: "content_outcome",
        artifact_id: data.id,
        artifact_text: body.slice(0, 8000),
        rating: win ? 1 : -1,
        reason: win ? "Performed well in the real world" : "Underperformed in the real world",
        context: { content_type: data.content_type },
      });
      await logBrainEvent(admin, parsed.data.client_id, "feedback",
        win ? `You marked a ${data.content_type} as a real-world win — the Brain will lean into what worked`
            : `You flagged a ${data.content_type} as underperforming — the Brain will adjust`,
        { content_type: data.content_type, outcome: parsed.data.outcome });
    } catch (e) {
      console.error("[content/outcome] signal failed", e);
    }
  }

  return NextResponse.json({ success: true, outcome: parsed.data.outcome });
});
