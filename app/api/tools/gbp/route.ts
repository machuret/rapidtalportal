/**
 * POST /api/tools/gbp — Google Business Profile Post Writer.
 * Topic (+ optional service) → 3 local-SEO GBP posts, grounded in the client's
 * company name, location and services from Company DNA.
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
  topic: z.string().min(3).max(500),
  service: z.string().max(200).optional(),
});

interface Post { body: string; cta: string; localAngle: string }

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a topic for the post." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;

  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await companyContext(parsed.data.clientId);
  const company = ctx.companyName ?? "the business";
  const contextBits = [
    ctx.location && `Location (use for local SEO): ${ctx.location}`,
    ctx.services && `Services: ${ctx.services}`,
    parsed.data.service && `Focus service for these posts: ${parsed.data.service}`,
    ctx.brandVoice && `Brand voice to match: ${ctx.brandVoice}`,
  ].filter(Boolean).join("\n");

  const system = await renderPrompt("tools.gbp", { company, context: contextBits });

  const result = await toolJson<{ posts: Post[] }>(system, `Topic: ${parsed.data.topic}`, 1800);
  if (!result.data?.posts?.length) {
    return NextResponse.json({ error: result.error ?? "Couldn't generate posts. Try again." }, { status: 502 });
  }

  const posts = result.data.posts
    .filter((p) => p.body?.trim())
    .slice(0, 3)
    .map((p) => ({ body: String(p.body).slice(0, 1600), cta: String(p.cta ?? "").slice(0, 40), localAngle: String(p.localAngle ?? "").slice(0, 120) }));

  const payload = { posts, hasContext: !!(ctx.location || ctx.services) };
  logToolRun("gbp", parsed.data.clientId, user.id, parsed.data.topic, result.tokens, payload);
  return NextResponse.json(payload);
});
