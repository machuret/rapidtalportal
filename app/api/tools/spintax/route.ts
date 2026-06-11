/**
 * POST /api/tools/spintax — Spintax Email Builder.
 * A campaign brief → a cold email written to RapidTal house style, with
 * spintax {option a|option b} baked into subject and body so every send is a
 * unique variation (better deliverability, less spam-foldering).
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
  brief: z.string().min(20).max(4000),
  audience: z.string().max(500).optional(),
});

interface Spintax { subject: string; preview: string; body: string }

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Describe the offer / campaign (a sentence or two)." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;

  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await companyContext(parsed.data.clientId);
  const sender = [
    ctx.companyName && `You are writing on behalf of ${ctx.companyName}.`,
    ctx.services && `What they offer: ${ctx.services}`,
    ctx.brandVoice && `Match this brand voice: ${ctx.brandVoice}`,
  ].filter(Boolean).join("\n");

  const system = await renderPrompt("tools.spintax", {
    outreach_style: await getPromptTemplate("style.outreach"),
    sender_context: sender,
  });

  const result = await toolJson<Spintax>(system, `Campaign brief: ${parsed.data.brief}${parsed.data.audience ? `\nTarget audience: ${parsed.data.audience}` : ""}`, 1800);
  if (!result.data?.body) {
    return NextResponse.json({ error: result.error ?? "Couldn't write the email. Try again." }, { status: 502 });
  }

  const r = result.data;
  const payload = {
    subject: stripDashes(String(r.subject ?? "")).slice(0, 300),
    preview: stripDashes(String(r.preview ?? "")).slice(0, 200),
    body: stripDashes(String(r.body ?? "")).slice(0, 3000),
  };
  logToolRun("spintax", parsed.data.clientId, user.id, parsed.data.brief.slice(0, 80), result.tokens, payload);
  return NextResponse.json(payload);
});
