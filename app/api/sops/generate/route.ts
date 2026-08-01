/**
 * POST /api/sops/generate — produce a full, structured SOP from a topic/title.
 * Strong model, JSON output: { intro, prerequisites[], steps[{title,detail,tip}] }.
 * The author reviews and edits before saving. Admin-only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { sopAiLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeSopScope, generateSopDraft } from "@/lib/sops/ai";

export const maxDuration = 60;

const schema = z.object({
  topic: z.string().min(3).max(300),
  title: z.string().max(300).optional(),
  category: z.string().max(100).optional(),
  audience: z.enum(["new", "experienced", "any"]).optional().default("any"),
  depth: z.enum(["quick", "standard", "thorough"]).optional().default("standard"),
  clientId: z.string().uuid().nullable().optional(),
  // "Improve with AI" on an existing SOP: the current content + what to change.
  existing: z.string().max(100000).optional(),
  instruction: z.string().max(1000).optional(),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A topic (3+ characters) is required." }, { status: 422 });

  const clientId = parsed.data.clientId ?? null;
  const denied = authorizeSopScope(user, clientId);
  if (denied) return denied;

  const rl = await sopAiLimiter.check(`sop-ai:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  // One shared generator (also used by the mass-produce endpoint) — no more
  // duplicated depth/audience hints or step sanitisation here.
  const { draft, error, tokens } = await generateSopDraft(clientId, {
    topic: parsed.data.topic,
    title: parsed.data.title,
    category: parsed.data.category,
    audience: parsed.data.audience,
    depth: parsed.data.depth,
    existing: parsed.data.existing,
    instruction: parsed.data.instruction,
  });
  if (!draft) {
    return NextResponse.json({ error: error ?? "Couldn't generate the SOP. Try again or adjust the topic." }, { status: 502 });
  }

  return NextResponse.json({ ...draft, tokensUsed: tokens });
}, { roles: ["client_admin", "super_admin"] });
