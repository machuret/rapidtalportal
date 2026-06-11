/**
 * POST /api/tools/reply-assistant — incoming comment/DM → 3 on-brand replies
 * in different registers (warm, brief, redirect), matched to brand voice.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool, companyContext, toolJson, logToolRun, TOOL_MODEL_MINI } from "@/lib/tools/ai";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  message: z.string().min(2).max(4000),
  context: z.string().max(500).optional(), // e.g. "they're complaining about a late delivery"
});

interface ReplyOption { style: string; text: string }

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Paste the comment or DM." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;

  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await companyContext(parsed.data.clientId);
  const bits = [
    ctx.companyName && `You reply as ${ctx.companyName}.`,
    ctx.brandVoice && `Brand voice: ${ctx.brandVoice}`,
    ctx.services && `What the business offers: ${ctx.services}`,
  ].filter(Boolean).join("\n");

  const system = `You write social media replies for a business.
${bits}

Return JSON: {"replies":[{"style":"label e.g. Warm & personal | Short & friendly | Move to DM/booking","text":"the reply"}]} — exactly 3 distinct options.
Rules: sound human, never corporate-robotic. Match the platform register (casual, emojis only if the inbound uses them). If it's a complaint: acknowledge first, never argue publicly, offer to take it to DM. If a detail (price, date, availability) isn't known, use a [placeholder] rather than inventing it. Each reply ≤500 characters.`;

  const userMsg = `Incoming message:\n"""\n${parsed.data.message}\n"""${parsed.data.context ? `\nContext from the VA: ${parsed.data.context}` : ""}`;

  const result = await toolJson<{ replies: ReplyOption[] }>(system, userMsg, 1200, TOOL_MODEL_MINI);
  if (!result.data?.replies?.length) {
    return NextResponse.json({ error: result.error ?? "Couldn't draft replies. Try again." }, { status: 502 });
  }

  const replies = result.data.replies
    .filter((r) => r.text?.trim())
    .slice(0, 3)
    .map((r) => ({ style: String(r.style ?? "").slice(0, 60), text: String(r.text).slice(0, 800) }));

  logToolRun("reply-assistant", parsed.data.clientId, user.id, parsed.data.message.slice(0, 80), result.tokens, { replies });
  return NextResponse.json({ replies });
});
