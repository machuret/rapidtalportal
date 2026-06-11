/**
 * POST /api/tools/newsletter — Email newsletter writer.
 * Topic / this week's updates → subject line, preview text, and a ready body.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool, companyContext, toolJson, logToolRun } from "@/lib/tools/ai";
import { renderPrompt } from "@/lib/prompts/server";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  topic: z.string().min(3).max(4000),
  tone: z.string().max(50).optional().default("Friendly"),
});

interface Newsletter { subject: string; preview: string; body: string }

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Describe what the newsletter is about." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;
  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await companyContext(parsed.data.clientId);
  const bits = [ctx.companyName && `From: ${ctx.companyName}`, ctx.services && `Offers: ${ctx.services}`, ctx.brandVoice && `Brand voice: ${ctx.brandVoice}`].filter(Boolean).join("\n");

  const system = await renderPrompt("tools.newsletter", {
    for_company: ctx.companyName ? ` for ${ctx.companyName}` : "",
    tone: parsed.data.tone,
    business_context: bits,
  });

  const result = await toolJson<Newsletter>(system, parsed.data.topic, 2500);
  if (!result.data?.body) return NextResponse.json({ error: result.error ?? "Couldn't write the newsletter." }, { status: 502 });

  const payload = {
    subject: String(result.data.subject ?? "").slice(0, 120),
    preview: String(result.data.preview ?? "").slice(0, 200),
    body: String(result.data.body).slice(0, 6000),
  };
  logToolRun("newsletter", parsed.data.clientId, user.id, parsed.data.topic.slice(0, 80), result.tokens, payload);
  return NextResponse.json(payload);
});
