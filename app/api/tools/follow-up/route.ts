/**
 * POST /api/tools/follow-up — Follow-up Sequence Generator.
 * Paste the initial cold email → a 4-touch follow-up sequence, each touch with
 * a send day, subject, body and the angle it works. RapidTal house style.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool, companyContext, toolJson, logToolRun, stripDashes } from "@/lib/tools/ai";
import { renderPrompt, getPromptTemplate } from "@/lib/prompts/server";

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

  const system = await renderPrompt("tools.follow-up", {
    outreach_style: await getPromptTemplate("style.outreach"),
    voice,
  });

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
