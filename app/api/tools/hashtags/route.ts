/**
 * POST /api/tools/hashtags — Hashtag researcher.
 * Topic/niche (+ platform) → hashtags grouped by reach tier so the mix isn't
 * all giant tags nothing ranks for.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool, companyContext, toolJson, logToolRun, TOOL_MODEL_MINI } from "@/lib/tools/ai";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  topic: z.string().min(2).max(500),
  platform: z.string().max(40).optional().default("Instagram"),
});

interface Groups { broad: string[]; niche: string[]; local: string[]; branded: string[]; note: string }

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a topic or niche." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;
  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await companyContext(parsed.data.clientId);
  const locality = ctx.location ? `Use this location for local tags: ${ctx.location}.` : "";

  const system = `You are a social media strategist researching hashtags for ${parsed.data.platform}.
${ctx.companyName ? `Business: ${ctx.companyName}.` : ""} ${locality}
Return JSON: {"broad":["high-volume tags"],"niche":["lower-competition, specific tags more likely to rank"],"local":["location-based tags"],"branded":["brand/campaign tags to own"],"note":"one line on how to mix them"}
Rules: include the # in each tag. 6-10 broad, 8-12 niche, 4-8 local (empty if no location), 2-4 branded. Realistic, not invented vanity tags.`;

  const result = await toolJson<Groups>(system, `Topic / niche: ${parsed.data.topic}`, 1200, TOOL_MODEL_MINI);
  if (!result.data) return NextResponse.json({ error: result.error ?? "Couldn't research hashtags." }, { status: 502 });

  const clean = (arr: unknown, n: number) => (Array.isArray(arr) ? arr : []).filter((t) => typeof t === "string" && t.trim()).slice(0, n).map((t) => String(t).trim());
  const payload = {
    broad: clean(result.data.broad, 12),
    niche: clean(result.data.niche, 14),
    local: clean(result.data.local, 10),
    branded: clean(result.data.branded, 6),
    note: String(result.data.note ?? "").slice(0, 300),
  };
  logToolRun("hashtags", parsed.data.clientId, user.id, parsed.data.topic.slice(0, 80), result.tokens, payload);
  return NextResponse.json(payload);
});
