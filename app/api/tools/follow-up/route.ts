/**
 * POST /api/tools/follow-up — Follow-up Sequence Generator.
 * Paste the initial cold email → a 4-touch follow-up sequence, each touch with
 * a send day, subject, body and the angle it works. RapidTal house style.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool, companyContext, toolJson, logToolRun, OUTREACH_STYLE, stripDashes } from "@/lib/tools/ai";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  email: z.string().min(20).max(6000),
});

interface Touch { day: number; subject: string; body: string; purpose: string }

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Paste the initial email you sent." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;

  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await companyContext(parsed.data.clientId);
  const voice = ctx.brandVoice ? `\nMatch this brand voice: ${ctx.brandVoice}` : "";

  const system = `You write cold-outreach follow-up sequences for a marketing agency's VA team.
${OUTREACH_STYLE}${voice}

Given the initial email, write a 4-touch follow-up sequence. Each touch is shorter than the last and tries a different angle so it does not feel like nagging. Reference the original lightly, never guilt-trip ("just bumping this", "did you see my email" are banned). The final touch is a polite break-up email.

Return JSON exactly: {"touches":[{"day":3,"subject":"subject line","body":"email body, 30-70 words, \\n line breaks","purpose":"the angle this touch uses (e.g. add value, social proof, break-up)"}]} — exactly 4 touches, send days roughly 3 / 7 / 12 / 20 after the prior send.
Rules: one CTA each. No em or en dashes. Keep {{first_name}} / {{company}} merge tokens, no invented names.`;

  const result = await toolJson<{ touches: Touch[] }>(system, `Initial email:\n${parsed.data.email}`, 2500);
  if (!result.data?.touches?.length) {
    return NextResponse.json({ error: result.error ?? "Couldn't build the sequence. Try again." }, { status: 502 });
  }

  const touches = result.data.touches
    .filter((t) => t.body?.trim())
    .slice(0, 4)
    .map((t, i) => ({
      day: Number(t.day) || [3, 7, 12, 20][i] || i + 1,
      subject: stripDashes(String(t.subject ?? "")).slice(0, 300),
      body: stripDashes(String(t.body ?? "")).slice(0, 2000),
      purpose: stripDashes(String(t.purpose ?? "")).slice(0, 120),
    }));
  logToolRun("follow-up", parsed.data.clientId, user.id, parsed.data.email.split("\n").find(Boolean)?.slice(0, 80) ?? "follow-up sequence", result.tokens, { touches });
  return NextResponse.json({ touches });
});
