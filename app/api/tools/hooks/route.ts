/**
 * POST /api/tools/hooks — Hook Rewriter.
 * Paste a flat post → 10 scroll-stopping first lines, each labelled with the
 * technique used so VAs learn the patterns.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api/with-auth";
import { toolsLimiter, tooManyRequests } from "@/lib/rate-limit";
import { authorizeTool, companyContext, toolJson, logToolRun } from "@/lib/tools/ai";

export const maxDuration = 60;

const schema = z.object({
  clientId: z.string().uuid(),
  content: z.string().min(20).max(8000),
});

interface Hook { hook: string; technique: string }

export const POST = withAuth(async (req, { user }) => {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Paste the post (at least a sentence or two)." }, { status: 422 });

  const denied = authorizeTool(user, parsed.data.clientId);
  if (denied) return denied;

  const rl = toolsLimiter.check(`tools:${user.id}`);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  const ctx = await companyContext(parsed.data.clientId);
  const voice = ctx.brandVoice ? `\nKeep hooks compatible with this brand voice: ${ctx.brandVoice}` : "";

  const system = `You are a direct-response copywriter. Rewrite the opening of a flat social post into 10 scroll-stopping first lines.${voice}

Return JSON: {"hooks":[{"hook":"the first line","technique":"pattern used"}]} — exactly 10, all different techniques. Use a spread of: bold claim, contrarian take, specific number/result, open question, curiosity gap, mistake/warning, story opener, direct callout ("If you…"), before/after, social proof.
Rules: each hook ≤100 characters, concrete (pull specifics from the post), no clickbait that the post can't pay off, no hashtags, no emojis unless the original used them.`;

  const result = await toolJson<{ hooks: Hook[] }>(system, parsed.data.content.slice(0, 6000), 1500);
  if (!result.data?.hooks?.length) {
    return NextResponse.json({ error: result.error ?? "Couldn't generate hooks. Try again." }, { status: 502 });
  }

  const hooks = result.data.hooks
    .filter((h) => h.hook?.trim())
    .slice(0, 10)
    .map((h) => ({ hook: String(h.hook).slice(0, 160), technique: String(h.technique ?? "").slice(0, 60) }));

  logToolRun("hooks", parsed.data.clientId, user.id, parsed.data.content.split("\n").find(Boolean)?.slice(0, 80) ?? "post", result.tokens);
  return NextResponse.json({ hooks });
});
