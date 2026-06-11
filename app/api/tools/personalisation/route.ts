/**
 * POST /api/tools/personalisation — Personalisation Line Writer.
 * Paste a prospect's website "About" text → 3 custom opening lines a VA can
 * drop into the first email so it reads researched, not blasted.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool, toolJson, logToolRun, OUTREACH_STYLE, stripDashes, TOOL_MODEL_MINI } from "@/lib/tools/ai";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  about: z.string().min(40).max(6000),
});

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Paste the prospect's About / homepage text." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;

  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const system = `You write personalised cold-email opening lines for a marketing agency's VA team.
${OUTREACH_STYLE}

From the prospect's website text, write 3 different opening lines that prove the email was written for them specifically. Reference something concrete from the text (what they do, a value, a recent move, their niche). Each line should flow naturally into a pitch. No flattery for its own sake, no "I came across your website".

Return JSON exactly: {"lines":["opening line 1","opening line 2","opening line 3"]} — exactly 3, each 1-2 sentences, each a different angle.
Rules: no em or en dashes. Use {{first_name}} / {{company}} merge tokens only if natural; never invent facts not in the text.`;

  const result = await toolJson<{ lines: string[] }>(system, `Prospect website text:\n${parsed.data.about.slice(0, 5000)}`, 800, TOOL_MODEL_MINI);
  if (!result.data?.lines?.length) {
    return NextResponse.json({ error: result.error ?? "Couldn't write the lines. Try again." }, { status: 502 });
  }

  const lines = result.data.lines
    .filter((l) => typeof l === "string" && l.trim())
    .slice(0, 3)
    .map((l) => stripDashes(String(l)).slice(0, 600));
  logToolRun("personalisation", parsed.data.clientId, user.id, parsed.data.about.slice(0, 80), result.tokens, { lines });
  return NextResponse.json({ lines });
});
